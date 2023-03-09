const fetch = require("node-fetch");
const config = require('./secret');
const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const {dataEntryLogger,cyLogger}=require('./logger')();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const save_to_file_interval=10*60*1000  , poll_interval=7*1000;
let traffic_db={},traffic_db_stat={initialTimestamp:Date.now(), records:0, nodeRecords:{}};

const tgbot = new TelegramBot(config.TGToken,
    {polling: true, request: {proxy: "http://127.0.0.1:10811",},});
const tgBotSendMessage = async (msg, isSilent = false, parseMode) => {
    /*Debug Only;no TG messages delivered*/
    // return tgLogger.info(`Blocked Msg: ${msg}`);
    await delay(100);
    let form = {};
    if (isSilent) form.disable_notification = true;
    if (parseMode) form.parse_mode = parseMode;
    await tgbot.sendMessage(config.My_TG_ID, msg, form).catch((e) => cyLogger.error(e));
};
tgbot.sendMessage2 = tgBotSendMessage;

tgbot.on('message', (msg) => {
    // noinspection JSUnresolvedVariable,JSIgnoredPromiseFromCall
    tgbot.sendMessage(msg.chat.id, 'Received your message,' + msg.chat.id);
    // noinspection JSUnresolvedVariable
    cyLogger.debug(`I received a message from chatId ${msg.chat.id}`);
});
// {
    tgbot.sendMessage(-1001765607580, 'Service Startup...', {
        message_thread_id: 2
    }).then(()=>{});
// }
//TODO:add delimiters and time-lapse in logs;
// add auto-login system to avoid cookie expire (after 1d appx.) and check-in system;
// integrate TG Bot for notification.


// No exiting when reach :EOF
// alwaysSleep(1000);
// function alwaysSleep(timeout) {
//     setTimeout(alwaysSleep, timeout, timeout);
// }
//----------

//以data子项的键名为索引
async function sub_processData(respJSON,is_local){
    if(respJSON.ret !== 1)return false;
    const nowTimestamp=Date.now();
    if(!is_local)cyLogger.trace(`Refreshed Data, ${JSON.stringify(respJSON)}`);
    for (const nodeIdStr in (respJSON.data)) {
        const nodeId=parseInt(nodeIdStr);
        const nodeData=respJSON.data[nodeId];
        if(!traffic_db[nodeId]) {
            //Non-exist : Create new mem-db entry
            traffic_db[nodeId] = [];
            traffic_db_stat.nodeRecords[nodeId]=0;
        }
        //Insert into my memory db
        // console.log(response,nodeId,nodeIdStr);
        traffic_db[nodeId].push({
            ts:nowTimestamp,
            name:nodeData.node_name,
            usedByte:nodeData.ud
        });
        traffic_db_stat.nodeRecords[nodeId]++;
        traffic_db_stat.records++;
    }
    //Check if mem-db is full.If so, Write to file.
    if(nowTimestamp > traffic_db_stat.initialTimestamp + save_to_file_interval)
        await sub_mergeAndSave();

    // logger.debug(traffic_db);
}



//Merge entries in mem-db, generate a general db for integrating into larger DB.
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
    for (const nodeId in traffic_db) {
        //nodeId is the key of outer circulation

        //get a copy of node-in-db
        let nodeEntries=traffic_db[nodeId];

        //Circulate to delete duplicate items
        for(let nodeEntryID in nodeEntries){
            nodeEntryID=parseInt(nodeEntryID);

            //The first entry of a node has nothing to compare, as of now
            if(nodeEntryID===0)continue;

            //Delete an entry that have no changes since last entry
            if(nodeEntries[nodeEntryID].usedByte===nodeEntries[nodeEntryID-1].usedByte){
                nodeEntries.splice(nodeEntryID,1);
            }
        }
        //Save back into mem-db
        traffic_db[nodeId]=nodeEntries;

        //Check in savedDB and merge into
            //In savedDB I use node_name for index.
            const nodeName=nodeEntries[0].name;
        let createdNow=false;
        if(!savedDB[nodeName]){
            //this means a new node which didn't appear in former times.
            //Start creating an entry in savedDB
            savedDB[nodeName]=[];
            createdNow=true;
        }
        let last_entry_in_savedDB=(!createdNow)?savedDB[nodeName][savedDB[nodeName].length-1]:{
            usedByte:0,
            ts2:nodeEntries[0].ts
        };
        for (const nodeEntriesKey in nodeEntries) {
            const thisEntry=nodeEntries[nodeEntriesKey];
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
            savedDB[nodeName].push(saveObj);

            // toSaveInCSV+=`${nodeName}\t\t,${convertToLocaleTime(saveObj.ts1)}, ${convertToLocaleTime(saveObj.ts2)}, ${saveObj.usedByte},${saveObj.increment}\n`;
            // dataEntryLogger.info(toSaveInCSV);
            dataEntryLogger.addContext("nodeName",nodeName.replace(" ",""));
            dataEntryLogger.addContext("usedTraffic1",(saveObj.usedByte/1024/1024).toFixed(3).toString());
            dataEntryLogger.addContext("increment1",(saveObj.increment!==-1)?(saveObj.increment/1024/1024).toFixed(3).toString():"-1");
            dataEntryLogger.addContext("usedTraffic2",saveObj.usedByte.toString());
            dataEntryLogger.addContext("increment2",(saveObj.increment!==-1)?saveObj.increment.toString():"-1");

            dataEntryLogger.info(`${convertToLocaleTime(saveObj.ts1)}, ${convertToLocaleTime(saveObj.ts2)}`);
            //Refresh last_entry_in_savedDB
            last_entry_in_savedDB=savedDB[nodeName][savedDB[nodeName].length-1];
            createdNow=false;
        } // for (const nodeEntriesKey in nodeEntries)

        //Now cleaning up traffic_db to avoid duplicate entries in db and log.
        nodeEntries.splice(0,nodeEntries.length-1);
        //Write back to memory
        traffic_db[nodeId]=nodeEntries;
    }
    fs.writeFileSync("database.json",JSON.stringify(savedDB,null,2));


}
async function pullData_local(t_what){
    cyLogger.debug(`pullData_local initiated with ${t_what}`);
    await fetch(`http://127.0.0.1/${t_what}.json`).then(response=>response.json()).then(async response=>{await sub_processData(response,1)});
}
async function pullData(){
    cyLogger.debug(`pullData initiated.`);
    await fetch("https://www.cutecloud.net/user/ajax_data/chart/index_node_traffic", {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cookie':config.cookie
        },
    }).then(response=>response.json()).then(async response=>{await sub_processData(response,0)});
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
setTimeout(()=>{
    setInterval(async()=>{
        await pullData().then(sub_mergeAndSave);
    },poll_interval);
},1000);


