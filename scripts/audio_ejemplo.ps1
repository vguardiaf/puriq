# Genera data/visita_ejemplo.wav (16 kHz, mono) con la voz en español de Windows a partir de
# data/visita_ejemplo.txt. Las líneas pares son la agente; las impares, la gestante (voz más grave).
# Es un juego de roles FICTICIO para el demo.
Add-Type -AssemblyName System.Speech
$raiz = Split-Path -Parent $PSScriptRoot
$lineas = Get-Content -Encoding UTF8 (Join-Path $raiz "data\visita_ejemplo.txt")
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("Microsoft Helena Desktop")
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile((Join-Path $raiz "data\visita_ejemplo.wav"), $fmt)
$ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-ES">'
for ($i = 0; $i -lt $lineas.Count; $i++) {
  $t = [System.Security.SecurityElement]::Escape($lineas[$i])
  if ($i % 2 -eq 0) { $ssml += "<prosody rate='+15%' pitch='+0%'>$t</prosody><break time='350ms'/>" }
  else { $ssml += "<prosody rate='+5%' pitch='-25%'>$t</prosody><break time='350ms'/>" }
}
$ssml += '</speak>'
$s.SpeakSsml($ssml)
$s.Dispose()
Write-Output "ok"
