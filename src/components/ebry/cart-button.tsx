import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { hydrateCart, setCartOwner, useCart } from "@/lib/cart-store";

/**
 * Tombol keranjang dengan badge jumlah item.
 *
 * Badge memakai jumlah item di keranjang, bukan jumlah unread. Isi keranjang
 * dibaca dari localStorage setelah mount: merendernya saat SSR akan
 * menghasilkan HTML berbeda dari client dan memicu hydration mismatch.
 */
export function CartButton({ className }: { className?: string }) {
  const { user } = useSession();
  const { count } = useCart();

  useEffect(() => {
    setCartOwner(user?.id ?? null);
    hydrateCart();
  }, [user?.id]);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={`relative min-h-11 min-w-11 ${className ?? ""}`}
    >
      <Link to="/keranjang" aria-label={count > 0 ? `Keranjang, ${count} item` : "Keranjang"}>
        <ShoppingCart className="size-5" aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
