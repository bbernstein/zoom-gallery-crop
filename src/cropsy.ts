type LayoutDescription = {
    area: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
};

export type CropValues = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

type RectValues = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * Parameters izzy needs for all the boxes of a single gallery
 */
export type IzzyPannerParams = {
     //Width of all the boxes in percentage of the screen
    widthPercent: Number;

    // Height of all the boxes in percentage of the screen
    heightPercent: Number;

    /**
     * Flattened array of x, y coordinates of each of the boxes
     * eg. if I have three boxes, there will be six values: [x1, y1, x2, y2, x3, y3]
     */
    cropPercents: Number[];
};

/**
 * Calculate optimal layout (most area used) of a number of boxes within a larger frame.
 * Given number of boxes, aspectRatio of those boxes, and spacing between them.
 *
 * Thanks to Anton Dosov for algorithm shown in this article:
 * https://dev.to/antondosov/building-a-video-gallery-just-like-in-zoom-4mam
 *
 * @param frameWidth width of the space holding the boxes
 * @param frameHeight height of the space holding the boxes
 * @param boxCount number of boxes to place (all same aspect ratio)
 * @param aspectRatio ratio of width to height of the boxes (usually 16/9)
 * @param spacing amount of space (margin) between boxes to spread them out
 * @returns A description of the optimal layout
 */
function calcOptimalBoxes(frameWidth: number,
                          frameHeight: number,
                          boxCount: number,
                          aspectRatio: number,
                          spacing: number): LayoutDescription {

    // keep track of the one with the biggest area, biggest is the best
    let bestLayout: LayoutDescription = {
        area: 0,
        cols: 0,
        rows: 0,
        width: 0,
        height: 0
    }

    // try each possible number of columns to find the one with the highest area (optimum use of space)
    for (let cols = 1; cols <= boxCount; cols++) {
        const rows = Math.ceil(boxCount / cols);
        // pack the frames together by removing the spacing between them
        const packedWidth = frameWidth - (spacing * (cols - 1));
        const packedHeight = frameHeight - (spacing * (rows - 1));
        const hScale = packedWidth / (cols * aspectRatio);
        const vScale = packedHeight / rows;
        let width;
        let height;
        if (hScale <= vScale) {
            width = Math.floor(packedWidth / cols / 16) * 16;
            height = Math.floor(width / aspectRatio / 9) * 9;
        } else {
            height = Math.floor(packedHeight / rows / 9 ) * 9;
            width = Math.floor(height * aspectRatio / 16 ) * 16;
        }
        const area = width * height;
        if (area > bestLayout.area) {
            bestLayout = { area, width, height, rows, cols };
        }
    }
    return bestLayout;
}

/**
 * Calculate crop values for the gallery boxes given the overall frame size and number of boxes in the gallary
 *
 * @param sourceWidth Width of the enclosing frame
 * @param sourceHeight Height of the enclosing frame
 * @param itemCount Number of boxes to lay out
 * @returns an array of crop values for a bunch of zoom boxes
 */
export function autoCropZoomGallery(sourceWidth: number, sourceHeight: number, itemCount: number): CropValues[] {

    // these work for me ymmv
    const topMargin = 47;
    const bottomMargin = 60;
    const leftMargin = 6;
    const rightMargin = 6;
    const spacing = 6;

    const aspectRatio = 16 / 9;

    let centerV = (sourceHeight - topMargin - bottomMargin) / 2 + topMargin;

    // width excluding margins
    const innerWidth = sourceWidth - leftMargin - rightMargin;
    const innerHeight = sourceHeight - topMargin - bottomMargin;

    let bestLayout: LayoutDescription = calcOptimalBoxes(innerWidth, innerHeight, itemCount, aspectRatio, spacing);

    const numCols = bestLayout.cols;
    const numRows = bestLayout.rows;
    const boxWidth = bestLayout.width;
    const boxHeight = bestLayout.height;

    // last row might not be full
    const lastRow = numRows - 1;
    const lastRowCols = numCols - (numRows * numCols - itemCount);

    const result: CropValues[] = [];

    // figure out crop for each item
    for (let i=0; i < itemCount; i++) {
        const colInd = i % numCols;
        const rowInd = Math.floor(i / numCols);
        const rowSize = (rowInd === lastRow) ? lastRowCols : numCols;

        const boxWidthSum = rowSize * boxWidth + (spacing * (rowSize - 1))
        const boxHeightSum = numRows * boxHeight + (spacing * (numRows - 1))

        const hMargin = (sourceWidth - boxWidthSum) / 2;

        const cropLeft = hMargin + (colInd * boxWidth) + (colInd * spacing);
        const cropRight = sourceWidth - (cropLeft + boxWidth);

        const cropTop = (centerV - boxHeightSum / 2) + (rowInd * (boxHeight + spacing));
        const cropBottom = sourceHeight - (cropTop + boxHeight);

        // squish in by 1 pixel in case of rounding errors, keeping the borders out of the picture
        result.push({ left: cropLeft + 1, right: cropRight + 1, top: cropTop + 1, bottom: cropBottom + 1});
    }

    return result;
}

/**
 * In case we need a rectangle version of the positions of each box
 * @param frameWidth width of each box
 * @param frameHeight height of each box
 * @param crops the crop values we created had
 */
export function convertCropsToRect(frameWidth: number, frameHeight: number, crops: CropValues[]): RectValues[] {
    return crops.map(crop => ({
        x: crop.left,
        y: crop.top,
        width: (frameWidth - crop.right) - crop.left,
        height: (frameHeight - crop.bottom) - crop.top
    }));
}

/**
 * Round the number to a bunch of decimals, but not too many
 *
 * @param num number to be rounded
 */
function oscFloatValue(num: number): number {
    return Math.round( (num + Number.EPSILON ) * 1000000 ) / 1000000;
}

/**
 * Calculate Isadora Panner values for a screen size and count of boxes
 * Send the values to izzy with OSC message.
 *
 * Example for count of 3, where 003 is part of the message name (always 3 digits 0-padded):
 * /izzy/cropValues/003 <boxWidth> <boxHeight> <panH1> <panV1> <panH2> <panV2> <panH3> <panV3>
 *
 * stick those values into an Isadora Panner and voíla, you've got a perfectly cropped box
 *
 * @param width screen width
 * @param height screen height
 * @param count number of zoom boxes
 */
export function calcIzzyPannerVals(width: number, height: number, count: number): IzzyPannerParams {
    const crops: CropValues[] = autoCropZoomGallery(width, height, count);
    let boxWidth = 0;
    let boxHeight = 0;
    let boxWidthP = 1;
    let boxHeightP = 1;
    if (crops.length > 0) {
        boxWidth = width - crops[0].left - crops[0].right;
        boxHeight = boxWidth / (16 / 9)
        boxWidthP = boxWidth / width;
        boxHeightP = boxHeight / height;
    }
    let cropPercents: Number[] = [];

    const boxWid2 = boxWidth / 2;
    const boxHei2 = boxHeight / 2;
    const screenWid = width - boxWidth;
    const screenHei = height - boxHeight;

    let screenCenterH = width / 2;
    let screenCenterV = height / 2;
    for (let i=1; i <= count; i++) {
        const boxCenterH = crops[i-1].left + boxWid2;
        const boxCenterV = crops[i-1].top + boxHei2;

        const panH = screenCenterH - boxCenterH;
        const panHP = 0.5 - panH / screenWid;
        const panV = screenCenterV - boxCenterV;
        const panVP = 0.5 - panV / screenHei;

        const aCrop = [ oscFloatValue(panHP * 100), oscFloatValue(panVP * 100) ]
        cropPercents.push(...aCrop);
    }
    return {
        widthPercent: oscFloatValue(boxWidthP * 100),
        heightPercent: oscFloatValue(boxHeightP * 100),
        cropPercents
    }
}

