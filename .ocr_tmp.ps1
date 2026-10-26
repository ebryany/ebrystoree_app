Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }

$dir = "C:\Users\febry\.zcode\cli\image-cache\sess_e87d96c2-6d11-4323-abad-5d5af9e9a771"
$files = @(
    "image-8e1c1fa02ef09d3a28891535866afcf0.png",
    "image-285b312222a3b4383fe9f02ea21a6169.png",
    "image-898a178092f27bcabd62be0449467bea.png",
    "image-3af683501085c79438807b9003a1a728.png",
    "image-11e61c9981c8bc4d95dd3b75f36ca96b.png",
    "image-f38a5b3b8287573dbb993b5a881e5e09.png",
    "image-30ca8c58fbd80a0634ca53a2650c0eab.png",
    "image-d52a3cf7896a24d665b4084418029183.png"
)

foreach ($f in $files) {
    $path = Join-Path $dir $f
    Write-Output "===== FILE: $f ====="
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        Write-Output ("DIMENSIONS: {0} x {1}" -f $bitmap.PixelWidth, $bitmap.PixelHeight)
        Write-Output "TEXT LINES:"
        foreach ($line in $result.Lines) { Write-Output ("  [" + $line.Text + "]") }
        Write-Output ("FULL TEXT: " + $result.Text)
        $stream.Dispose()
    } catch {
        Write-Output ("ERROR: " + $_.Exception.Message)
    }
    Write-Output ""
}
