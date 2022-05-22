import restler from "restler";

import { callLimitExceeded } from "./static.js";
import { sliceCommandPart, upperFirst } from "./lib/util.js";

const WEATHER_CALL_LIMIT = 58; // per min
const WEATHER_API_KEY = "cca2238b3b47b33135b3e16f85d17142";
const WEATHER_CACHE = {
    perMinute: 0,
    byPeerId: {}
}

// restore limit
setInterval(() => {
    WEATHER_CACHE.perMinute = 0;
}, 60000);

const Explore = {
    getWikiSummary(title) {
        return new Promise(resolve => {
            return restler.get(
                encodeURI(`https://ru.wikipedia.org/api/rest_v1/page/summary/${title}`)
            ).on("complete", async article => {
                if (!article || !article.extract) return resolve(false);

                return resolve(article);
            });
        });
    },
    searchWiki(query, count = 1) {
        return new Promise(resolve => {
            const requestURL = `https://ru.wikipedia.org/w/api.php?action=query&list=search&utf8=&format=json&srlimit=${count}&srsearch=${query}`;

            return restler.get(
                encodeURI(requestURL)
            ).on("complete", wiki => {
                if (
                    !wiki 
                    || !wiki.query 
                    || !Array.isArray(wiki.query.search)
                    || !wiki.query.search.length
                ) return resolve(false);

                if (count > 1) return resolve(wiki.query.search)

                return resolve(wiki.query.search[0]);
            });
        });
    },
    getCurrentWeather(ctx) {
        const { text, peer_id } = ctx.message;
        const town = sliceCommandPart(text, 0, 2);

        if (WEATHER_CACHE.perMinute >= WEATHER_CALL_LIMIT) return callLimitExceeded(ctx);
        if (WEATHER_CACHE.byPeerId[peer_id]) {
            let callDifference = +new Date() - WEATHER_CACHE.byPeerId[peer_id];
            if (callDifference < 60000) return callLimitExceeded(ctx);
        }

        const searchHelp = (
            `Город не найден, попробуйте следющее:\n`
            + `1) Проверьте написание\n`
            + `2) Напишите название в именительном падеже\n`
            + `3) Напишите название города на латинице (английском)`
        );

        if (!town || town.length < 2) return ctx.reply(searchHelp);

        WEATHER_CACHE.perMinute += 1;
        WEATHER_CACHE.byPeerId[peer_id] = +new Date();

        const requestURL = `https://api.openweathermap.org/data/2.5/weather?q=${town}&appid=${WEATHER_API_KEY}&units=metric&lang=ru`;
        return restler.get(
            encodeURI(requestURL)
        ).on("complete", json => {
            if (json.cod != 200) return ctx.reply(searchHelp);

            const { dt, name, weather, main, sys, wind } = json;
            const getHours = (sec) => {
                var date = new Date(sec * 1000);
                return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
            }
            
            return ctx.reply(
                `🌤️ Погода:\n`
                + `${name} / ${upperFirst(weather[0].description)}\n\n`
                + `Темп. Воздуха: ${Math.round(main.temp)}℃\n`
                + `(Ощущается как ${Math.round(main.feels_like)}℃)\n\n`
                + `Ветер: ${wind.speed} м/с\n`
                + `Влажность: ${main.humidity}%\n\n`
                + `Восход: ${getHours(sys.sunrise)}\n`
                + `Закат: ${getHours(sys.sunset)}\n\n`
                + `Обновлено ${getHours(dt)}`
            );
        });
    }
} 

export default Explore;