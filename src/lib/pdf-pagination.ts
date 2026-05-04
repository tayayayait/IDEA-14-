export interface PdfImagePlacement {
  addPageBefore: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfImagePlacementInput {
  canvasWidth: number;
  canvasHeight: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
}

export const buildPdfImagePlacements = ({
  canvasWidth,
  canvasHeight,
  pageWidth,
  pageHeight,
  margin,
}: PdfImagePlacementInput): PdfImagePlacement[] => {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [];

  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  if (printableWidth <= 0 || printableHeight <= 0) return [];

  const imageWidth = printableWidth;
  const imageHeight = (canvasHeight * imageWidth) / canvasWidth;
  const pageCount = Math.max(1, Math.ceil(imageHeight / printableHeight));

  return Array.from({ length: pageCount }, (_, index) => ({
    addPageBefore: index > 0,
    x: margin,
    y: margin - printableHeight * index,
    width: imageWidth,
    height: imageHeight,
  }));
};
