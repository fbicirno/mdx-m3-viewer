// A simple 24-bit BMP handler
function BMPTexture() {
    
}

BMPTexture.prototype = {
    loadstart: function (asyncTexture, src, reportError, reportLoad) {
        // Simple binary reader implementation, see src/binaryreader.
        var binaryReader = new BinaryReader(src);

        // BMP magic identifier
        if (read(binaryReader, 2) !== "BM") {
            reportError("BMP: BadFormat");
            return;
        }

        skip(binaryReader, 8);

        var dataOffset = readUint32(binaryReader);

        skip(binaryReader, 4);

        var width = readUint32(binaryReader);
        var height = readUint32(binaryReader);

        skip(binaryReader, 2);

        var bpp = readUint16(binaryReader);

        if (bpp !== 24) {
            reportError("BMP: Only 24 bits per pixel supported");
            return;
        }

        var compression = readUint32(binaryReader);

        if (compression !== 0) {
            reportError("BMP: compressed images are not supported");
            return;
        }

        seek(binaryReader, dataOffset);

        // Read width*height RGB pixels
        var data = readUint8Array(binaryReader, width * height * 3);

        var ctx = asyncTexture.ctx;

        var id = ctx.createTexture();
        ctx.bindTexture(ctx.TEXTURE_2D, id);
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, 1);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGB, width, height, 0, ctx.RGB, ctx.UNSIGNED_BYTE, data);
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, 0);
        ctx.generateMipmap(ctx.TEXTURE_2D);

        this.id = id; // If the id isn't set, this texture won't be bound to a texture unit

        // Report that this texture was loaded properly, otherwise it will be ignored
        reportLoad();
    }
};