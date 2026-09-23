param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\web\src\kostra\robek-history.json')
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Convert-RobekDate([object]$value) {
  if ($value -is [double] -or $value -is [int]) {
    return [datetime]::FromOADate([double]$value).ToString('yyyy-MM-dd')
  }

  $normalized = ([string]$value).Trim() -replace '(\d{2})\.(\d{2})\s+(\d{4})', '$1.$2.$3'
  $parsed = [datetime]::MinValue
  $culture = [System.Globalization.CultureInfo]::GetCultureInfo('nb-NO')
  if ([datetime]::TryParse($normalized, $culture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
    return $parsed.ToString('yyyy-MM-dd')
  }
  throw "Ukjent ROBEK-dato: $value"
}

try {
  $workbook = $excel.Workbooks.Open((Resolve-Path $InputPath), 0, $true)
  $sheet = $workbook.Worksheets.Item('Innmeldingogutmelding(fra2024)')
  $values = $sheet.UsedRange.Value2
  $rows = [ordered]@{}

  for ($rowIndex = 2; $rowIndex -le $values.GetLength(0); $rowIndex++) {
    if ($null -eq $values[$rowIndex, 1]) { continue }

    $code = ([string][int]$values[$rowIndex, 1]).PadLeft(4, '0')
    $events = @()
    for ($columnIndex = 4; $columnIndex -le 53; $columnIndex++) {
      $serial = $values[$rowIndex, $columnIndex]
      if ($null -eq $serial -or $serial -eq '') { continue }
      $header = [string]$values[1, $columnIndex]
      $events += [ordered]@{
        type = if ($header -match 'Inn') { 'in' } else { 'out' }
        date = Convert-RobekDate $serial
      }
    }

    if ($events.Count -gt 0) {
      $rows[$code] = [ordered]@{
        name = [string]$values[$rowIndex, 2]
        events = $events
      }
    }
  }

  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
  }
  $rows | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputPath -Encoding utf8NoBOM
  $workbook.Close($false)
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
