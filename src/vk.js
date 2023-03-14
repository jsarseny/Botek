import restler from "restler";
import Bot, { Config } from "../VK/bot.mjs";

// The helpers of heavy VK API methods
const VK = {
    async getUser(userId, fields) {
        const callApi = await Bot.execute("users.get", {
            user_ids: userId,
            fields: fields || ""
        });

        if (callApi.length < 2) return callApi[0];
        return callApi;
    },
    async getGroup(groupId) {
        const callApi = await Bot.execute("groups.getById", {
            group_ids: Math.abs(groupId)
        });

        if (callApi.length < 2) return callApi[0];
        return callApi;
    },

    uploadPhoto(img) {
        return new Promise(async resolve => {
            const uploadServer = await Bot.execute("photos.getMessagesUploadServer", { peer_id: 0 });

            if (!uploadServer || uploadServer.error) return resolve({ error: uploadServer.error });

            return restler.post(uploadServer.upload_url, {
                multipart: true,
                data: {
                    file: restler.data("upload.png", "image/png", img)
                }
            }).on("complete", async upload => {
                if (!upload) return resolve({ error: "Failed to upload image" });

                try {
                    upload = JSON.parse(upload);
                    
                    const savePhoto = await Bot.execute("photos.saveMessagesPhoto", upload);
                    if (!savePhoto || savePhoto.error || !savePhoto[0]) return resolve({ error: savePhoto.error });

                    let photo = savePhoto[0];
                    let photoId = "photo" + photo.owner_id + "_" + photo.id;

                    return resolve({
                        error: false,
                        photoId
                    });
                } catch (err) {
                    console.log(err, upload);
                    return resolve({ error: err });
                }
            }); 
        });
    },
    async uploadAudio(buffer, peer_id, opts = {}) {
        opts = {
            type: opts.type || "audio/mpeg",
            ext: opts.ext || "mp3"
        }

        const server = await Bot.execute("docs.getMessagesUploadServer", {
            type: "audio_message",
            peer_id: peer_id,
        });

        return new Promise(resolve => {
            restler.post(server.upload_url, {
                multipart: true,
                data: {
                    file: restler.data(`upload.${opts.ext}`, opts.type, buffer)
                }
            }).on("complete", async function(data) {
                if (!data) return resolve({ error: true });

                const save = await Bot.execute("docs.save", data);
                if (!save) return resolve({ error: true });

                let audioMessage = save.audio_message;
                let docId = "doc" + audioMessage.owner_id + "_" + audioMessage.id;
                return resolve({
                    error: false,
                    docId
                });
            }); 
        });
    },
    uploadCover(img, sizes) {
        return new Promise(async resolve => {
            const uploadServer = await Bot.execute("photos.getOwnerCoverPhotoUploadServer", { 
                group_id: Config.groupId,
                crop_x: sizes.cropX || 0,
                crop_y: sizes.cropY || 0,
                crop_x2: sizes.cropX2 || 0,
                crop_y2: sizes.cropY2 || 0
            });
            if (!uploadServer || uploadServer.error) return resolve({ error: true });

            return restler.post(uploadServer.upload_url, {
                multipart: true,
                data: {
                    file: restler.data("upload.png", "image/png", img)
                }
            }).on("complete", async upload => {
                if (!upload) return resolve({ error: true });

                try {
                    const { hash, photo } = JSON.parse(upload);
                    
                    await Bot.api("photos.saveOwnerCoverPhoto", {
                        access_token: Config.access_token,
                        hash, photo
                    });
                } catch (err) {
                    return resolve({ error: true });
                }
            }); 
        });
    },
}

export default VK;