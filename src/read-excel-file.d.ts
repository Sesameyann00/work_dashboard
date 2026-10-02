declare module 'read-excel-file' {
  type Cell = string | number | boolean | Date | null
  export default function readXlsxFile(file: File): Promise<Cell[][]>
}
