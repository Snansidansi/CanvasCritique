export interface Point {
  x: number;
  y: number;
}

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stroke {
  id?: string;
  color: string;
  width: number;
  points: Point[];
  bounds?: StrokeBounds;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export function getStrokesBoundingBox(history: Stroke[], canvasMode: 'infinite' | 'a4', a4Orientation: 'portrait' | 'landscape' = 'portrait'): BoundingBox | null {
  if (!history || history.length === 0) return null;
  
  const drawingStrokes = history.filter(s => s.color !== 'eraser' && s.color !== '#FFFFFF' && s.points.length > 0);
  if (drawingStrokes.length === 0) return null;
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const stroke of drawingStrokes) {
    const halfWidth = stroke.width / 2;
    for (const p of stroke.points) {
      if (p.x - halfWidth < minX) minX = p.x - halfWidth;
      if (p.y - halfWidth < minY) minY = p.y - halfWidth;
      if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
      if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
    }
  }
  
  const padding = 20;
  if (canvasMode === 'a4') {
    const a4W = a4Orientation === 'landscape' ? 1130 : 800;
    const a4H = a4Orientation === 'landscape' ? 800 : 1130;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(a4W, maxX + padding);
    maxY = Math.min(a4H, maxY + padding);
  } else {
    minX = minX - padding;
    minY = minY - padding;
    maxX = maxX + padding;
    maxY = maxY + padding;
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  if (width <= 0 || height <= 0) return null;
  return { 
    x: Math.round(minX), 
    y: Math.round(minY), 
    width: Math.round(width), 
    height: Math.round(height) 
  };
}

export function drawStroke(ctxTarget: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;
  
  ctxTarget.save();
  ctxTarget.beginPath();
  
  if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') {
    ctxTarget.globalCompositeOperation = 'destination-out';
    ctxTarget.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctxTarget.globalCompositeOperation = 'source-over';
    ctxTarget.strokeStyle = stroke.color;
  }
  
  ctxTarget.lineWidth = stroke.width;
  ctxTarget.lineCap = 'round';
  ctxTarget.lineJoin = 'round';
  
  ctxTarget.moveTo(stroke.points[0].x, stroke.points[0].y);
  if (stroke.points.length === 1) {
    ctxTarget.lineTo(stroke.points[0].x, stroke.points[0].y);
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      ctxTarget.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
  }
  ctxTarget.stroke();
  ctxTarget.restore();
}

export function drawGuidelinesInWorld(
  ctxTarget: CanvasRenderingContext2D,
  xStart: number,
  yStart: number,
  wVisible: number,
  hVisible: number,
  activeBg: string,
  bgOpacity: number
): void {
  ctxTarget.save();
  ctxTarget.globalAlpha = bgOpacity / 100;
  
  const lineSpacing = 32;
  const colSpacing = 32;
  const startY = Math.ceil(yStart / lineSpacing) * lineSpacing;
  const endY = yStart + hVisible;
  
  if (activeBg === 'lines') {
    ctxTarget.strokeStyle = '#000000';
    ctxTarget.lineWidth = 1;
    for (let y = startY; y <= endY; y += lineSpacing) {
      ctxTarget.beginPath();
      ctxTarget.moveTo(xStart, y);
      ctxTarget.lineTo(xStart + wVisible, y);
      ctxTarget.stroke();
    }
  } else if (activeBg === 'grid') {
    const startI = Math.floor(xStart / colSpacing);
    const endI = Math.ceil((xStart + wVisible) / colSpacing);
    
    ctxTarget.fillStyle = '#000000';
    for (let k = Math.floor(startY / lineSpacing); k <= Math.ceil(endY / lineSpacing); k++) {
      const yWorld = k * lineSpacing;
      for (let i = startI; i <= endI; i++) {
        const xWorld = i * colSpacing;
        ctxTarget.beginPath();
        ctxTarget.arc(xWorld, yWorld, 1.5, 0, 2 * Math.PI);
        ctxTarget.fill();
      }
    }
  }
  ctxTarget.restore();
}

export function calculateStrokeBounds(stroke: Stroke): StrokeBounds {
  if (!stroke.points || stroke.points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const halfWidth = stroke.width / 2;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - halfWidth,
    minY: minY - halfWidth,
    maxX: maxX + halfWidth,
    maxY: maxY + halfWidth
  };
}

export function ensureStrokeBounds(stroke: Stroke): Stroke {
  const bounds = stroke.bounds;
  if (!bounds || typeof bounds.minX !== 'number' || (bounds.minX === 0 && bounds.maxX === 0 && stroke.points && stroke.points.length > 1)) {
    stroke.bounds = calculateStrokeBounds(stroke);
  }
  return stroke;
}
