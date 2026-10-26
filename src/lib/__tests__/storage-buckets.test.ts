import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261003100000_missing_storage_buckets.sql", "utf8");

describe("missing Storage buckets migration contract", () => {
  it("provisions exactly three private bucket manifests with bounded bytes", () => {
    const manifests = [...sql.matchAll(/\('([a-z-]+)', (\d+)::bigint, (.+)\)/g)];
    expect(manifests.map(([, id, bytes]) => [id, Number(bytes)])).toEqual([
      ["avatars", 2097152],
      ["academic-order-attachments", 20971520],
      ["job-results", 41943040],
    ]);
    expect(manifests[0][3]).toBe(
      "ARRAY['image/jpeg','image/png','image/webp','image/avif']::text[]",
    );
    expect(manifests.slice(1).map((match) => match[3])).toEqual(["NULL::text[]", "NULL::text[]"]);
    expect(sql).toContain(
      "VALUES (expected.id, expected.id, false, expected.file_size_limit, expected.allowed_mime_types)",
    );
  });

  it("does not overwrite existing buckets or expand access", () => {
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING;");
    expect(sql).not.toMatch(
      /\b(DO UPDATE|UPDATE storage|DELETE|TRUNCATE|DROP|CREATE POLICY|ALTER|GRANT|REVOKE|true)\b/i,
    );
    expect([...sql.matchAll(/\bINSERT INTO\s+(\S+)/g)].map(([, target]) => target)).toEqual([
      "storage.buckets",
    ]);
    expect(sql).not.toMatch(
      /product-files|payment-proofs|catalog-images|storage\.objects|public\./,
    );
  });

  it("rejects privacy, name and byte-limit conflicts null-safely", () => {
    expect(sql).toContain("actual.name IS DISTINCT FROM expected.id");
    expect(sql).toContain("actual.public IS DISTINCT FROM false");
    expect(sql).toContain("actual.file_size_limit IS DISTINCT FROM expected.file_size_limit");
    expect(sql).toContain("SELECT * INTO STRICT actual");
    expect(sql).toContain("WHERE id = expected.id FOR UPDATE;");
  });

  it("checks MIME content without depending on ordering or conflating null with empty", () => {
    expect(sql).toContain(
      "(actual.allowed_mime_types IS NULL) IS DISTINCT FROM (expected.allowed_mime_types IS NULL)",
    );
    expect(sql.match(/array_agg\(mime ORDER BY mime\)/g)).toHaveLength(2);
    expect(sql).toContain("unnest(actual.allowed_mime_types)");
    expect(sql).toContain("unnest(expected.allowed_mime_types)");
    expect(sql).toMatch(/\)\s+IS DISTINCT FROM\s+\(SELECT array_agg/);
  });

  it("keeps provisioning and conflict rejection in one atomic statement", () => {
    expect(sql.trim()).toMatch(/^DO \$\$[\s\S]*END;\s*\$\$;$/);
    expect(sql.match(/\bDO \$\$/g)).toHaveLength(1);
    expect(sql).toContain("RAISE EXCEPTION 'STORAGE_BUCKET_MANIFEST_CONFLICT: %', expected.id;");
    expect(sql).not.toMatch(/\b(COMMIT|ROLLBACK|EXCEPTION WHEN)\b/);
  });
});
