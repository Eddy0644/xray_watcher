// import * as c from './auxiliary';
const fetch = require("node-fetch");
// const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const {dataEntryLogger,cyLogger,conLogger,config}=require('./auxiliary')();

// const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const save_to_file_interval=4*1000  , poll_interval=2*1000;
let traffic_db={},traffic_db_stat={initialTimestamp:Date.now(), records:0, nodeRecords:{}};
// const tgbot = new require('node-telegram-bot-api')(config.TGToken,

//     {polling: true, request: {proxy: "http://127.0.0.1:10811",},});
// const tgBotSendMessage = async (msg, isSilent = false, parseMode) => {
//     /*Debug Only;no TG messages delivered*/
//
//     // return tgLogger.info(`Blocked Msg: ${msg}`);
//     await delay(100);
//     let form = {};
//     if (isSilent) form.disable_notification = true;
//     if (parseMode) form.parse_mode = parseMode;
//     await tgbot.sendMessage(config.My_TG_ID, msg, form).catch((e) => cyLogger.error(e));
// };
// tgbot.sendMessage2 = tgBotSendMessage;
//
// tgbot.on('message', (msg) => {
//     // noinspection JSUnresolvedVariable,JSIgnoredPromiseFromCall
//     tgbot.sendMessage(msg.chat.id, 'Received your message,' + msg.chat.id);
//     // noinspection JSUnresolvedVariable
//     cyLogger.debug(`I received a message from chatId ${msg.chat.id}`);
// });
// {
//     tgbot.sendMessage(-1001765607580, 'Service Startup...', {
//         message_thread_id: 2
//     }).then(()=>{});
// }
//TODO:add delimiters and time-lapse in logs;
// integrate TG Bot for notification.


async function sub_processData(respJSON,is_local){
    const nowTimestamp=Date.now();
    if(!is_local)cyLogger.trace(`Gained Raw Data, ${JSON.stringify(respJSON)}`);
    for (const ItemId in (respJSON)) {
        const ItemData=respJSON[ItemId];
        if(!ItemData.value)continue;
        if(!traffic_db[ItemData.name]) {
            //Non-exist : Create new mem-db entry
            traffic_db[ItemData.name] = [];
        }
        //Insert into my memory db
        traffic_db[ItemData.name].push({
            ts:nowTimestamp,
            usedByte:ItemData.value
        });
    }
    //Check if it is time to rewrite mem-db .If so, Write to file.
    if(nowTimestamp > traffic_db_stat.initialTimestamp + save_to_file_interval) {
        //TODO:Merge the two functions together.
        await sub_mergeAndSave();
    }
    // logger.debug(traffic_db);
}
//Merge entries in mem-db, generate a general db for integrating into larger DB.

function getItemFriendlyName(originalName){
    return originalName;
    //TODO: alias names from "outbound>>>proxy>>>traffic>>>downlink" to "proxy.↓"
}

async function sub_mergeAndSave(){
    //use json to store data
    let savedDB=JSON.parse(fs.readFileSync("database.json").toString());
    //TODO:Need to rewrite this function to make a better log
    const convertToLocaleTime=(ts)=>{
        // add 8 hours to let ISO time fits the china one.
        let a=new Date(ts+28800*1000);
        // return a.toDateString()+a.toTimeString().substring(0,9);
        let b=a.toISOString().replace('T',' ').replace('Z','').replace('2023-','23');
        return b.substring(0,b.length-4);
    };
    //start iterating over the array
    for (const ItemName in traffic_db) {
        //ItemName is the key of outer circulation
        //get a copy of node-in-db

        let ItemEntries=traffic_db[ItemName];
        //Circulate to delete duplicate items

        for(let ItemEntryID in ItemEntries){
            ItemEntryID=parseInt(ItemEntryID);
            //The first entry of a node has nothing to compare, as of now

            if(ItemEntryID===0)continue;
            //Delete an entry that have no changes since last entry

            if(ItemEntries[ItemEntryID].usedByte===ItemEntries[ItemEntryID-1].usedByte){
                ItemEntries.splice(ItemEntryID,1);
            }
        }
        //Save back into mem-db
        traffic_db[ItemName]=ItemEntries;
        //Check in savedDB and merge into

        //In savedDB I use node_name for index.
        let createdNow=false;
        if(!savedDB[ItemName]){
            //this means a new node which didn't appear in former times.
            //Start creating an entry in savedDB
            savedDB[ItemName]=[];
            createdNow=true;
        }
        let last_entry_in_savedDB=(!createdNow)?savedDB[ItemName][savedDB[ItemName].length-1]:{
            usedByte:0,
            ts2:ItemEntries[0].ts
        };
        for (const ItemEntriesKey in ItemEntries) {
            const thisEntry=ItemEntries[ItemEntriesKey];
            if(last_entry_in_savedDB.usedByte===thisEntry.usedByte){
                //usedByte not change, not inserting
                continue;
            }
            //Saving
            const saveObj={
                ts1:last_entry_in_savedDB.ts2,
                usedByte:thisEntry.usedByte,
                ts2:thisEntry.ts,
                increment:(!createdNow)?thisEntry.usedByte-last_entry_in_savedDB.usedByte:-1
            };
            savedDB[ItemName].push(saveObj);
            // toSaveInCSV+=`${ItemName}\t\t,${convertToLocaleTime(saveObj.ts1)}, ${convertToLocaleTime(saveObj.ts2)}, ${saveObj.usedByte},${saveObj.increment}\n`;
                //TODO:
            // dataEntryLogger.info(toSaveInCSV);
            dataEntryLogger.addContext("nodeName",getItemFriendlyName(ItemName));
            dataEntryLogger.addContext("usedTraffic1",(saveObj.usedByte/1024/1024).toFixed(3).toString());
            dataEntryLogger.addContext("increment1",(saveObj.increment!==-1)?(saveObj.increment/1024/1024).toFixed(3).toString():"-1");
            dataEntryLogger.addContext("usedTraffic2",saveObj.usedByte.toString());
            dataEntryLogger.addContext("increment2",(saveObj.increment!==-1)?saveObj.increment.toString():"-1");
            dataEntryLogger.info(`${convertToLocaleTime(saveObj.ts1)}, ${convertToLocaleTime(saveObj.ts2)}`);

            //Refresh last_entry_in_savedDB
            last_entry_in_savedDB=savedDB[ItemName][savedDB[ItemName].length-1];
            createdNow=false;
        } // end: for (const nodeEntriesKey in ItemEntries)
        //Now cleaning up traffic_db to avoid duplicate entries in db and log.

        ItemEntries.splice(0,ItemEntries.length-1);
        //Write back to memory
        traffic_db[ItemName]=ItemEntries;
    }
    fs.writeFileSync("database.json",JSON.stringify(savedDB,null,2));
}


// noinspection JSUnusedLocalSymbols
async function pullData_local(t_what){
    cyLogger.debug(`pullData_local initiated with ${t_what}`);
    await fetch(`http://127.0.0.1/${t_what}.json`).then(response=>response.json()).then(async response=>{await sub_processData(response,1)});
}

let pullData_error_flag=0;
function pullData(next_interval){
    const child = require('child_process').exec('D:\\_App\\v2rayN-Core\\xray.exe api statsquery --server=127.0.0.1:1188')

    child.stdout.on('data', async data => {
        await sub_processData(JSON.parse(data).stat,false);
        if(pullData_error_flag){
            //Here to clean the error flag
            cyLogger.info(`xray incident solved after ${pullData_error_flag} fail retries.`);
            pullData_error_flag=0;
        }
        if(next_interval!==0)setTimeout(r=>{pullData(next_interval)},next_interval);
    });
    child.stderr.on('data', err => {
        if(pullData_error_flag === 0){
            //error flag = 0
            cyLogger.warn(`xray thrown an error: ${err}`);
            pullData_error_flag=1;
        }else{
            //error flag > 0
            if(pullData_error_flag%5){
                pullData_error_flag++;
            }else{
                cyLogger.debug(`Another 5 xray error thrown.`);
            }
        }
        if(next_interval!==0)setTimeout(r=>{pullData(next_interval)},next_interval);

    });
}
//Uncomment this to breed data from some cached files.
// pullData_local("ta").then(r=>{
//     pullData_local("tb").then(sub_mergeAndSave).then(r=>{
//         delay(500).then(r=>{
//             pullData_local("tc").then(sub_mergeAndSave);
//             setTimeout(()=>{
//                 setInterval(async()=>{
//                     await pullData().then(sub_mergeAndSave);
//                 },poll_interval);
//             },3000);
//         })
//     })
// });
pullData(poll_interval);



