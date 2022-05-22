import Log from "./log.js";
import MongoDB from "mongodb";

const MongoClient = new MongoDB.MongoClient("mongodb://localhost:27017", {
    useNewUrlParser: true, 
    useUnifiedTopology: true 
});

var DataBaseExemp, Mongo;
MongoClient.connect(async function(err, client) {
    Log.print(err || "Local server started");
    Log.print("MongoDB module launched");

    DataBaseExemp = client.db("Botek"),
    Mongo = {
        client,
        Main: DataBaseExemp.collection("Main"),
    }
});

const CURRENT_VERSION = "v4";
const getCurrent = async () => {
    return await Mongo.Main.findOne({ "name": CURRENT_VERSION });
}

const DataBase = {
    get c() {
        return Mongo.Main;
    },

    async getWords() {
        const global = await getCurrent();

        return global.catalog;
    },
    async setWords(obj) {
        var keys = Object.keys(obj);
        keys.map(item => obj[item].sort());

        return await Mongo.Main.findOneAndUpdate(
            { "name": CURRENT_VERSION },
            { $set: { "catalog": obj }}
        );
    },

    async getNeural() {
        const global = await getCurrent();

        return global.neural;
    },
    async setNeural(object) {
        return await Mongo.Main.findOneAndUpdate(
            { "name": CURRENT_VERSION },
            { $set: { "neural": object }}
        ); 
    }
}

export default DataBase;