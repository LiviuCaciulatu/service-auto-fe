export async function htmlToPdf(selector = '.preview-container .preview-scale', filename = 'document.pdf') {
  // dynamic imports so dev doesn't require packages unless used
  const html2canvasMod = await import('html2canvas').catch(() => null)
  const jsPdfMod = await import('jspdf').catch(() => null)
  const html2canvas = html2canvasMod && (html2canvasMod.default || html2canvasMod)
  const jsPdf = jsPdfMod && (jsPdfMod.jsPDF || jsPdfMod.default || jsPdfMod)
  if (!html2canvas || !jsPdf) throw new Error('html2canvas or jspdf not available. Run `npm install html2canvas jspdf`')

  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error(`Element not found: ${selector}`)

  const canvas = await html2canvas(el, { scale: 2 })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPdf('p', 'mm', 'a4')
  const imgProps = pdf.getImageProperties(imgData)
  const pdfWidth = 210 // A4 width in mm
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
  pdf.save(filename)
}

export default htmlToPdf
