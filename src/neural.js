import DataBase from "./lib/db.js";

import { Config } from "../bot.mjs";
import { 
    chance, 
    SafeRegExp,
    useGroupChat,
    randomElement,
} from "./lib/util.js";

// NEURAL CONFIG
const MEMORY_CHANCE = 35;
const BOT_MEMORY_CHANCE = 20;
const ATTACHMENT_MEMORY_CHANCE = 40;

const NEURAL_REPLY_CHANCE = 59;

const NODE_DISPATCH_THRESHOLD = 2;
const ATTACHMENT_DISPATCH_THRESHOLD = 1;

const CACHE = {
    byWaitingId: {
        textNodes: {},
    },
    byPeerId: {
        textNodes: {},
        attachmentNodes: {}
    },

    async dispatchNode(peer_id) {
        const current = await DataBase.getNeural();
        var messages = this.byPeerId.textNodes[peer_id];

        if (!messages) return;
        messages = [...new Set(messages)];

        current.textNodes.push(messages);
        this.destroyNode(peer_id);

        return await DataBase.setNeural(current);
    },
    async realiseExistingNode(peer_id) {
        const current = await DataBase.getNeural();
        const { groupIndex, messages } = this.byWaitingId.textNodes[peer_id];
        var currentGroup = current[groupIndex];

        if (!currentGroup || !messages || !messages.length) return;

        currentGroup = currentGroup.concat(messages);
        currentGroup = [...new Set(currentGroup)];
        current.textNodes[groupIndex] = currentGroup;

        this.destroyNode(peer_id);
        return await DataBase.setNeural(current);
    },

    async loadMessage(text, peer_id) {
        const { groupIndex, phraseIndex } = await getPhraseIndex(text, "strict");

        // use existing node if phrase exist in database
        if (groupIndex > -1) return this.byWaitingId.textNodes[peer_id] = {
            groupIndex, 
            phraseIndex,
            messages: []
        }
        
        // if exist a pending cache :D
        if (this.byWaitingId.textNodes[peer_id]) {
            this.byWaitingId.textNodes[peer_id].messages.push(text);

            return this.realiseExistingNode(peer_id);
        }

        // create new node otherwise
        this.byPeerId.textNodes[peer_id] = this.byPeerId.textNodes[peer_id] || [];
        const messages = this.byPeerId.textNodes[peer_id];

        if (messages.length >= 2) return;
        if (messages.indexOf(text) > -1) return;
        messages.push(text);

        // dispatch node on overflow!
        if (messages.length >= NODE_DISPATCH_THRESHOLD) this.dispatchNode(peer_id);
    },

    loadAttachment(attachment, peer_id) {
        this.destroyNode(peer_id, "textNodes");
        this.destroyNode(peer_id, "attachmentNodes");

        this.byPeerId.attachmentNodes[peer_id] = {
            type: attachment.type,
            messages: []
        }
    },
    async dispatchAttachment(text, peer_id) {
        if (!this.byPeerId.attachmentNodes[peer_id]) return;
        this.byPeerId.attachmentNodes[peer_id].messages.push(text);

        const node = this.byPeerId.attachmentNodes[peer_id];
        if (node.messages.length < ATTACHMENT_DISPATCH_THRESHOLD) return;

        const current = await DataBase.getNeural();
        current.attachmentNodes[node.type] = current.attachmentNodes[node.type] || [];
        current.attachmentNodes[node.type] = current.attachmentNodes[node.type].concat(node.messages);
        
        current.attachmentNodes[node.type] = [...new Set(current.attachmentNodes[node.type])];

        this.destroyNode(peer_id, "attachmentNodes");
        return await DataBase.setNeural(current);
    },

    // should call only inside dispatch methods (memory leak possible otherwise)
    destroyNode(peer_id, type = "textNodes") {
        if (type == "textNodes") delete this.byWaitingId.textNodes[peer_id];

        delete this.byPeerId[type][peer_id];
    }
}

/**
 * Extension of the randomElement method, with the ability to exclude indexes
 * @param {any[]} array target array
 * @param {number|number[]} exclude excluded indexes
 * @returns {any} random element of array
 */
export const randomElementExtended = (array, exclude) => {
    exclude = Array.isArray(exclude) ? exclude : [ exclude ];
    array = array.filter((item, i) => !exclude.includes(i));

    return randomElement(array);
}

/**
 * Search for index and group in database by substring
 * @param {string} text - substring for searching in database
 * @param {"default" | "strict"} mode search mode
 * @returns current state
 */
const getPhraseIndex = async (text, mode = "default") => {
    const current = await DataBase.getNeural();
    const isStrict = mode == "strict";

    var groupIndex = -1;
    var phraseIndex = -1;

    current.textNodes.map((group, groupIdx) => {
        if (groupIndex > -1 && phraseIndex > -1) return;

        group.map((phrase, phraseIdx) => {
            if (groupIndex > -1 && phraseIndex > -1) return;

            let isTriggered = false;

            const includesRegexp = new SafeRegExp(phrase, "ig");
            const wrapRegexp = new SafeRegExp(text, "ig");

            isTriggered = wrapRegexp.test(phrase);

            if (!isTriggered && isStrict) return;
            else if (!isTriggered) isTriggered = includesRegexp.test(text);

            if (isTriggered) {
                groupIndex = groupIdx;
                phraseIndex = phraseIdx;
            }
        });
    });

    return {
        groupIndex,
        phraseIndex,
        currentGroup: current.textNodes[groupIndex]
    }
}

/**
 * Find phrase by attachment type
 * @param {string} type type of attachment, e.g: "photo"
 * @returns {string} random phrase among the memory
 */
const getPhraseByAttachment = async type => {
    const current = await DataBase.getNeural();

    if (!current.attachmentNodes[type]) return;

    return randomElement(current.attachmentNodes[type]);
}

/**
 * Сhecks the compliance of the text with the conditions of memorization
 * @param {string} text validation text
 * @returns {boolean} boolean
 */
const parseText = text => {
    if (!/^[?!,.-а-яА-ЯёЁ0-9\s]+$/ig.test(text)) return false;
    if (!/^[а-яё]/ig.test(text)) return false;
    if (/(https?:\/\/|ftps?:\/\/|www\.)((?![.,?!;:()]*(\s|$))[^\s]){2,}/gim.test(text)) return false;

    text = text.replace(/\n/ig, " ").replace(/ {1,}/ig, " ").trim();
    const words = text.split(" ");

    if (text.length > 64 || text.length < 3) return false;
    if (words.length > 8 || words.length < 1) return false;

    text = text.replace(/ё/ig, "е");
    text = text.replace(/(^-)|(-$)/ig, "");

    if (!text || !text.length) return false;

    return text;
}

const Neural = {
    async middleware(ctx, next) {
        const { 
            text, attachments,
            peer_id, from_id
        } = ctx.message;

        const isFromBot = from_id < 0;
        const isGroupChat = useGroupChat(peer_id);
        const hasAttachments = (attachments && attachments.length > 0);

        //if (Config.adminId !== ctx.message.from_id) return next(); // uncomment while developing/comment on deploy
        if (!text && !hasAttachments) return next();

        var isAnswered = false;
        var isLoaded = false;

        const preventDefault = (destroy = false) => {
            if (destroy) CACHE.destroyNode(peer_id);

            return !isAnswered && next();
        }

        if (chance(NEURAL_REPLY_CHANCE)) {
            const answer = await this.answer(ctx.message);

            if (answer) {
                isAnswered = true;
                ctx.reply(answer);
            }
        }

        // use chances
        if (!isGroupChat) return preventDefault();
        if (isFromBot && !chance(BOT_MEMORY_CHANCE)) return preventDefault();
        if (hasAttachments && isFromBot) return preventDefault();

        if (hasAttachments) {
            let hasWaitingAttachment = CACHE.byPeerId.attachmentNodes[peer_id];

            if (hasWaitingAttachment || chance(ATTACHMENT_MEMORY_CHANCE)) {
                isLoaded = true;
                CACHE.loadAttachment(attachments[0], peer_id);
            }
        }

        if (
            !CACHE.byPeerId.textNodes[peer_id]
            && !CACHE.byWaitingId.textNodes[peer_id]
            && !CACHE.byPeerId.attachmentNodes[peer_id]
            && !chance(MEMORY_CHANCE)
        ) return preventDefault(true);

        // trim up text!
        if (!isLoaded) {
            const validate = parseText(text);
            if (!validate) return preventDefault();

            isLoaded = true;
            if (CACHE.byPeerId.attachmentNodes[peer_id]) {
                CACHE.dispatchAttachment(validate, peer_id);
            } else CACHE.loadMessage(validate, peer_id);
        }

        if (isAnswered) return;
        if (
            isGroupChat
            && chance(60)
        ) return preventDefault();

        return;
    },

    async answer(message) {
        const phrase = message.text;
        const attachment = message.attachments && message.attachments[0];

        const isPhrase = phrase && phrase.length > 0;
        const isAttachmentImportant = Boolean(isPhrase && attachment) && chance(75);

        if (
            (!isPhrase && attachment)
            || isAttachmentImportant
        ) {
            const find = getPhraseByAttachment(attachment.type);

            if (find) return find;
        }

        if (!isPhrase) return false;

        const {
            groupIndex,
            phraseIndex,
            currentGroup
        } = await getPhraseIndex(phrase, "default");

        if (!currentGroup || groupIndex < 0 || phraseIndex < 0) return false;
        const element = randomElementExtended(
            currentGroup,
            phraseIndex
        );

        return element;
    }
}

export default Neural;