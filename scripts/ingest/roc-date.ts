// TWSE / TPEx 回傳的日期都是民國年格式 "YYYMMDD"（例："1150701" = 民國115年07月01日）
export function rocDateToIso(rocDate: string): string {
  if (!/^\d{7}$/.test(rocDate)) {
    throw new Error(`unexpected ROC date format: "${rocDate}"`)
  }
  const rocYear = Number(rocDate.slice(0, 3))
  const month = rocDate.slice(3, 5)
  const day = rocDate.slice(5, 7)
  const westernYear = rocYear + 1911
  return `${westernYear}-${month}-${day}`
}
