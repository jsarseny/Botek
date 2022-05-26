import VK from "./vk.js";
import Jimp from "jimp";
import Canvas from "canvas";
import Static from "./static.js";

import { randomElement, randomInt, sliceCommandPart } from "./lib/util.js";

const { 
    loadImage,
    createCanvas,
    registerFont
} = Canvas;

const randomHex = () => `#${Math.floor(Math.random() * 16777215).toString(16)}`;

registerFont("src/assets/Caveat-Regular.ttf", { family: "Caveat" });

const Images = {
    defaultUpload: async (canvas, ctx) => {
        const upload = await VK.uploadPhoto(canvas.toBuffer());

        if (upload.error || !upload.photoId) return internalError(ctx);
        return ctx.reply(
            randomElement(Static.ImageResult), 
            upload.photoId
        );
    },

    async buildLowQuality(ctx) {
        var params = ctx.message.text.split(" ");
        var qualityParam = params[2] && Number.parseFloat(params[2].trim());
        var quality = 94;

        if (qualityParam && qualityParam > 0 && qualityParam < 101) quality = qualityParam;

        const attachment = getTypedAttachments(ctx.message, "photo");
        if (!attachment) return ctx.reply(
            randomElement(Static.NoImage)
        );

        const image = getMaxPhotoSize(attachment.photo.sizes);
        const stream = await Jimp.read({ url: image.url });
        const lowerQuality = stream.quality(101 - quality);

        const upload = await VK.uploadPhoto(
            await lowerQuality.getBufferAsync(Jimp.AUTO)
        );
        if (upload.error || !upload.photoId) return internalError(ctx);

        return ctx.reply(randomElement(Static.ImageResult), upload.photoId);
    },

    async buildDemotivator(ctx) {
        const [ forwardText, bottomText ] = sliceCommandPart(ctx, 0, 2).split("/");

        if (!forwardText) return ctx.reply("Пример команды:\n/d dem <текст сверху>/<текст снизу> + картинка");

        const attachment = getTypedAttachments(ctx.message, "photo");
        if (!attachment) return ctx.reply(randomElement(Static.NoImage));

        const image = getMaxPhotoSize(attachment.photo.sizes);

        const deltaWidth = Math.round(Math.max(getPercentPart(image.width, 12), 55));
        const deltaHeight = deltaWidth * 3;

        const canvas = createCanvas(image.width + deltaWidth, image.height + deltaHeight);
        const context = canvas.getContext("2d");

        // rendering
        context.fillStyle = "#000";
        context.textAlign = "center";
        context.strokeStyle = "#fff";
        context.font = `${deltaWidth}px serif`;
        context.lineWidth = Math.ceil(canvas.width / 1000);

        var imageStrokePadding = Math.floor(deltaWidth / 2 / 4.5);
        var imageBottomY = deltaWidth / 2 + image.height + imageStrokePadding;
        var marginText = imageBottomY + deltaHeight / 3;

        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeRect(
            deltaWidth / 2 - imageStrokePadding, 
            deltaWidth / 2 - imageStrokePadding,
            image.width + imageStrokePadding * 2, 
            image.height + imageStrokePadding * 2
        );

        const imageBuffer = await loadImage(image.url);

        context.fillStyle = "#fff";
        context.drawImage(imageBuffer, deltaWidth / 2, deltaWidth / 2);

        context.fillText(forwardText, canvas.width / 2, marginText);
        
        if (bottomText) {
            context.font = `${deltaWidth * 0.65}px serif`;
            context.fillText(bottomText, canvas.width / 2, marginText + deltaWidth * 0.85);
        }

        return this.defaultUpload(canvas, ctx);
    },

    async buildAdvice(ctx) {
        const [ forwardText, bottomText ] = sliceCommandPart(ctx, 0, 2).split("/");

        if (!forwardText) return ctx.reply("Пример команды:\n/d adv <текст сверху>/<текст снизу> + картинка");

        const attachment = getTypedAttachments(ctx.message, "photo");
        if (!attachment) return ctx.reply(randomElement(Static.NoImage));

        const image = getMaxPhotoSize(attachment.photo.sizes);
        const delta = Math.floor(getPercentPart(image.height, 14)); // use as unit of font size

        const canvas = createCanvas(image.width, image.height);
        const context = canvas.getContext("2d");

        // rendering
        context.fillStyle = "#FFF";
        context.textAlign = "center";
        context.strokeStyle = "#000";
        context.font = `${delta}px Impact`;
        context.lineWidth = 3 + Math.ceil(canvas.width / 1200);

        if (canvas.width < 720) context.lineWidth = 2;

        const imageBuffer = await loadImage(image.url);
        context.drawImage(imageBuffer, 0, 0, canvas.width, canvas.height);

        renderLines(context, forwardText, {
            maxWidth: canvas.width - 10,
            startX: canvas.width / 2,
            startY: delta,
            fontSize: delta,
            shouldStrokeText: true,
        });

        if (bottomText) {
            renderLines(context, bottomText, {
                maxWidth: canvas.width - 10,
                startX: canvas.width / 2,
                startY: canvas.height - 32,
                fontSize: delta,
                shouldStrokeText: true,
                shouldInvert: true
            });
        }

        return this.defaultUpload(canvas, ctx);
    },

    async buildQuote(ctx) {
        var [ quote, author ] = sliceCommandPart(ctx, 0, 2).split("/");
        var text, sourceMessage;

        const errorMessage = (
            `Цитата создается так:\n\n`
            + `• Обложкой цитаты будет либо первая найденная фотография, либо аватар автора\n`
            + `• Текстом будет либо текст, указанный в команде, либо ближайший текст среди пересланных сообщений\n`
            + `• Автором будет либо автор, указанный в команде, либо автор ближайшего пересланного сообщения\n\n`
            + `/d quote <текст цитаты>/<автор цитаты>`
        );

        if (!quote) {
            let extended = getAllMessageText(ctx.message, true, true)[1];

            if (!extended) return ctx.reply(errorMessage);

            text = extended.text;
            sourceMessage = extended;
        } else {
            text = quote;
            sourceMessage = ctx.message;
        }

        var cover;
        const attachment = getTypedAttachments(ctx.message, "photo");

        if (attachment) cover = getMaxPhotoSize(attachment.photo.sizes).url;
        if (!attachment || !author) {
            let isFromBot = sourceMessage.from_id < 0;
            let profile = isFromBot ? await VK.getGroup(sourceMessage.from_id) : await VK.getUser(sourceMessage.from_id);

            let [ name, surname ] = [
                !isFromBot ? profile.first_name : profile.name,
                !isFromBot ? profile.last_name : ""
            ];
            
            author = (author || `${name} ${surname}`).trim();
            cover = cover || profile.photo_200;
        }

        // rendering
        const canvas = createCanvas(1024, 512);
        const context = canvas.getContext("2d");

        const padding = 50;
        const imageSize = 200;
        const fontSize = 45;
        
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const imageBuffer = await loadImage(cover);
        context.drawRoundedImage(imageBuffer, 100, padding, padding, imageSize, imageSize);

        context.fillStyle = "#FFF";
        context.font = `${fontSize}px Caveat`;

        var authorY = canvas.height - 1.5 * padding;
        var quoteX = padding + 2 * imageSize;
        var quoteMaxWidth = canvas.width - (quoteX + padding);

        renderLines(context, `© ${author}`, {
            fontSize,
            maxWidth: 3 * imageSize,
            startX: padding,
            startY: authorY
        });

        context.font = `${fontSize}px serif`;
        renderLines(context, text, {
            fontSize,
            maxWidth: quoteMaxWidth,
            startX: quoteX,
            startY: 1.5 * padding
        });

        return this.defaultUpload(canvas, ctx);
    },

    async buildConcat(ctx) {
        const DEFAULT_EXPONENT = 70;
        const errorMessage = (
            `/d concat <степень> - Конкатенировать изображения:\n\n`
            + `• Прикрепите от 2 до 4 изображений, бот наложит их друг на друга\n`
            + `• Используйте параметр <степень>, для изменение прозрачности накладываемых изображений (число 0 - 100, 70 по умолчанию)`
        );

        var exponent = Number.parseInt(
            sliceCommandPart(ctx, 0, 2, true)[0]
        );
        
        if (Number.isNaN(exponent) || exponent < 0 || exponent > 100) {
            exponent = DEFAULT_EXPONENT;
        }

        var attachments = getTypedAttachments(ctx.message, "photo", true).slice(0, 4);
        if (attachments.length < 2) return ctx.reply(errorMessage);

        const source = getMaxPhotoSize(attachments[0].photo.sizes);

        const canvas = createCanvas(source.width, source.height);
        const context = canvas.getContext("2d");

        context.drawImage(
            await loadImage(source.url), 
            0, 0, canvas.width, canvas.height
        );

        for (var i = 1; i < attachments.length; i++) {
            let { url } = getMaxPhotoSize(attachments[i].photo.sizes);
            let cur = await loadImage(url);

            context.globalAlpha = exponent / 100;
            context.drawImage(cur, 0, 0, canvas.width, canvas.height);
        }

        context.globalAlpha = 1;

        return this.defaultUpload(canvas, ctx);
    },

    buildRandomPatternImage() {
        const canvasSize = 650;
        const canvas = createCanvas(canvasSize, canvasSize);
        const ctx = canvas.getContext("2d");

        const nodes = [];
        for (var i = 0; i < randomInt(16, 128); i++) nodes.push([
            randomInt(0, canvasSize),
            randomInt(0, canvasSize)
        ]);

        nodes.map((node, i, arr) => {
            ctx.beginPath();
            const [ x, y ] = node;
            const color = randomHex();

            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;

        	ctx.arc(x, y, 5, 0, 2 * Math.PI);

            arr.map(item => {
                ctx.moveTo(x, y);
                ctx.lineTo(item[0], item[1]);
            });

            ctx.fill();
            ctx.stroke();
        	ctx.closePath();
        });

        // draw crazy backdrop
        /*let [ xIndex, yIndex ] = [ 0, 0 ];
        for (var i = 0; i < canvasSize * canvasSize; i++) {
            if (xIndex >= canvasSize) xIndex = 0;
            if (yIndex >= canvasSize) yIndex = 0;

            let [ w, h ] = [ randomInt(1, 16), randomInt(1, 16) ];
            ctx.fillStyle = randomHex();
            ctx.fillRect(xIndex, yIndex, w, h);

            xIndex += w;
            if (xIndex >= canvasSize) yIndex += h;
        }

        // draw overlay figures
        for (var i = 0; i < randomInt(12, 2500); i++) {
            ctx.beginPath();
            ctx.fillStyle = randomHex();
            ctx.strokeStyle = randomHex();

            randomElement([
                () => {
                    ctx.fillRect(
                        randomInt(1, canvasSize),
                        randomInt(1, canvasSize),
                        randomInt(16, 32),
                        randomInt(16, 32),
                    );
                },
                () => {
                    ctx.arc(
                        randomInt(1, canvasSize),
                        randomInt(1, canvasSize),
                        randomInt(16, 32),
                        (randomInt(0, 360) * Math.PI),
                        (randomInt(0, 360) * Math.PI),
                    );
                    ctx.fill();
                }
            ])();
        }

        // draw lines
        let lastLinePosition = null;
        for (var i = 0; i < randomInt(25, 25); i++) {
            if (!lastLinePosition) lastLinePosition = [
                randomInt(1, canvasSize),
                randomInt(1, canvasSize)
            ];

            let [ x, y ] = lastLinePosition;
            let [ moveX, moveY ] = [
                randomInt(1, canvasSize),
                randomInt(1, canvasSize)
            ]

            ctx.beginPath();
            ctx.lineCap = "round";
            ctx.lineWidth = randomInt(2, canvasSize / 4);
            ctx.strokeStyle = randomHex();

            ctx.moveTo(x, y);
            ctx.lineTo(moveX, moveY);
            ctx.stroke();
            ctx.closePath();

            lastLinePosition = [ moveX, moveY ];
        }*/

        return canvas.toBuffer();
    }
}

export default Images;

export const getTypedAttachments = (message, type = "photo", returnArray = false) => {
    var attachments = [];

    attachments = attachments.concat(
        message.attachments,
        (message.reply_message && message.reply_message.attachments) || []
    );

    // find in forwarded messages
    message.fwd_messages.forEach(fwd => {
        fwd.attachments.forEach(fwd_att => {
            return attachments.push(fwd_att);
        });
    });

    attachments = attachments.filter(attachment => attachment.type === type);

    if (!attachments) return returnArray ? [] : null;
    return returnArray ? attachments : attachments[0];
}

export const getAllMessageText = (message, extended = false, returnArray = false) => {
    var text = [];

    var source = extended ? message : message.text;
    var reply = message.reply_message && (extended ? message.reply_message : message.reply_message.text)

    text = text.concat(source, reply || []);

    message.fwd_messages.forEach(fwd => extended ? text.push(fwd) : text.push(fwd.text));
    text = text.filter(item => {
        if (extended) return item.text.trim().length > 0;

        return item.trim().length > 0;
    });

    if (!text) return returnArray ? [] : null;
    return returnArray ? text : text[0];
}

export const getMaxPhotoSize = (sizes) => {
    const types = [ "s", "m", "x", "o", "p", "q", "r", "y", "z", "w" ];
    var currentObject = { type: null };

    sizes.forEach(e => currentObject = types.indexOf(e.type) > types.indexOf(currentObject.type) ? e : currentObject)

    return currentObject;
}

export const getBufferByUrl = async (url) => {
    try {
        const stream = await Jimp.read({ url });

        return await stream.getBufferAsync(Jimp.AUTO);
    } catch (err) {
        return false;
    }
}

export const splitLines = (ctx, text, maxWidth, asArray = false) => {
    var words = text.split(" ")
    var lines = [];
    var currentLine = words[0];

    for (var i = 1; i < words.length; i++) {
        var word = words[i];
        var width = ctx.measureText(currentLine + " " + word).width;

        if (width < maxWidth) currentLine += " " + word;
        else lines.push(currentLine), currentLine = word;
    }

    lines.push(currentLine);
    if (asArray) return lines;

    return lines.join("\n");
}

export const renderLines = (ctx, text, preferens) => {
    preferens = {
        maxWidth: preferens.maxWidth || 150,
        startX: preferens.startX || 0,
        startY: preferens.startY || 0, 
        fontSize: preferens.fontSize || 12,
        shouldStrokeText: Boolean(preferens.shouldStrokeText),
        shouldInvert: Boolean(preferens.shouldInvert)
    }

    const lines = splitLines(ctx, text, preferens.maxWidth, true);
    if (preferens.shouldInvert) lines.reverse();

    lines.map((line, i) => {
        let marginY = preferens.startY + preferens.fontSize * i;
        let marginX = preferens.startX;

        if (preferens.shouldInvert) marginY = preferens.startY - preferens.fontSize * i;

        ctx.fillText(line, marginX, marginY);

        if (preferens.shouldStrokeText) {
            ctx.strokeText(line, marginX, marginY);
        }
    });
}

export const getPercentPart = (int, percent) => int * percent / 100;

Canvas.CanvasRenderingContext2D.prototype.drawRoundedImage = function(img, r, x, y, w, h) {
    this.beginPath();
    this.arc(x + r, y + r, r, Math.PI, Math.PI + Math.PI / 2 , false);
    this.lineTo(x + w - r, y);
    this.arc(x + w - r, y + r, r, Math.PI + Math.PI / 2, Math.PI * 2 , false);
    this.lineTo(x + w, y + h - r);
    this.arc(x + w - r, y + h - r, r, Math.PI * 2, Math.PI / 2, false);
    this.lineTo(x + r, y + h);
    this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    this.closePath();
    this.save();
    this.clip();
    this.drawImage(img, x, y, w, h);
    this.restore();
}