import {powerOfTwo} from './math';

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d');

let canvas2 = document.createElement('canvas');
let ctx2 = canvas2.getContext('2d');

/**
 * @param {Blob} blob
 * @return {Promise<Image>}
 */
export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    let url = URL.createObjectURL(blob);
    let image = new Image();

    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;

      ctx.drawImage(image, 0, 0);

      resolve(image);
    };

    image.onerror = (e) => {
      reject(e);
    };

    image.src = url;
  });
}

/**
 * @param {Blob} blob
 * @return {Promise<ImageData>}
 */
export function blobToImageData(blob) {
  return new Promise((resolve, reject) => {
    let url = URL.createObjectURL(blob);
    let image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      canvas.width = image.width;
      canvas.height = image.height;

      ctx.drawImage(image, 0, 0);

      resolve(ctx.getImageData(0, 0, image.width, image.height));
    };

    image.onerror = (e) => {
      reject(e);
    };

    image.src = url;
  });
}

/**
 * @param {ImageData} imageData
 * @return {Promise<Blob>}
 */
export function imageDataToBlob(imageData) {
  return new Promise((resolve, reject) => {
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob((blob) => {
      resolve(blob);
    });
  });
}

/**
 * @param {ImageData} imageData
 * @return {string}
 */
export function imageDataToDataUrl(imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}

/**
 * @param {ImageData} imageData
 * @return {Image}
 */
export function imageDataToImage(imageData) {
  let image = new Image();

  image.src = imageDataToDataUrl(imageData);

  return image;
}

/**
 * @param {Image} image
 * @return {ImageData}
 */
export function imageToImageData(image) {
  let width = image.width;
  let height = image.height;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(image, 0, 0);

  return ctx.getImageData(0, 0, width, height);
}

/**
 * @param {ImageData} imageData
 * @return {ImageData}
 */
export function scaleNPOT(imageData) {
  let width = imageData.width;
  let height = imageData.height;
  let potWidth = powerOfTwo(width);
  let potHeight = powerOfTwo(height);

  if (width !== potWidth || height !== potHeight) {
    return resizeImageData(imageData, potWidth, potHeight);
  }

  return imageData;
}

/**
 * @param {ImageData} data
 * @param {number} width
 * @param {number} height
 * @return {ImageData}
 */
export function resizeImageData(data, width, height) {
  let srcWidth = data.width;
  let srcHeight = data.height;

  // ImageData
  if (data instanceof ImageData) {
    canvas.width = srcWidth;
    canvas.height = srcHeight;

    ctx.putImageData(data, 0, 0);

    canvas2.width = width;
    canvas2.height = height;

    ctx2.drawImage(canvas, 0, 0, width, height);

    return ctx2.getImageData(0, 0, width, height);
    // Assumed to be Image
  } else {
    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(data, 0, 0, width, height);

    return ctx.getImageData(0, 0, width, height);
  }
}

// This should be queried from the WebGL context. For now though, just keep it constant.
const TEXTURE_ATLAS_MAX_WIDTH = 2048;

/**
 * Given an array of ImageData objects, constructs a texture atlas.
 * The dimensions of each tile are equal to the width of the first image (that is, all images are assumed to have the same size!).
 *
 * @param {Array<ImageData>} src
 * @return {Object}
 */
export function createTextureAtlas(src) {
  let cells = src.length;
  let cellSize = src[0].width;
  let cellsPerRow = (TEXTURE_ATLAS_MAX_WIDTH / cellSize) | 0;
  let columns = 0;
  let rows = 0;

  for (let i = 1; i < cellsPerRow; i++) {
    columns = cells / i;

    if (columns === (columns | 0) && columns <= cellsPerRow) {
      rows = cells / columns;
      break;
    }
  }

  canvas.width = cellSize * columns;
  canvas.height = cellSize * rows;

  for (let i = 0, l = src.length; i < l; i++) {
    let x = (i % columns) * cellSize;
    let y = ((i / columns) | 0) * cellSize;

    ctx.putImageData(src[i], x, y);
  }

  return {imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), columns, rows};
}
