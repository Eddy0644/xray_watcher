const log4js = require('log4js');
const logger_pattern = "[%d{hh:mm:ss.SSS} %5.5p] %m";
const logger_pattern_console = "[%d{yy/MM/dd hh:mm:ss} %[%5.5p]%] %m";
log4js.configure({
    appenders: {
        "console": {
            type: "console",
            layout: {
                type: "pattern",
                pattern: logger_pattern_console
            },
        },
        "dateLog": {
            type: "dateFile",
            filename: "logs/day",
            pattern: "yyMM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: logger_pattern
            },
        },
        "dataEntryCSV": {
            type: "dateFile",
            filename: "logs/dataLog",
            pattern: "yyMM-dd.csv",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: "%-17.17X{nodeName},%m,%9.9X{usedTraffic1}MB,%8.8X{increment1}MB,%-11.11X{usedTraffic2},%-11.11X{increment2}",
            },
        },
        "dataEntryLog": {
            type: "dateFile",
            filename: "logs/dataLog",
            pattern: "yyMM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: "%-17.17X{nodeName},%m,Total %9.9X{usedTraffic1}MB, Diff %8.8X{increment1}MB. \t[RawData: total %-11.11X{usedTraffic2},diff %-11.11X{increment2}]",
            },
        },
        "dataEntryCon": {
            type: "console",
            layout: {
                type: "pattern",
                pattern: "[%d{yy/MM/dd hh:mm:ss}  NODE] %17.17X{nodeName},Total %9.9X{usedTraffic1}MB, Diff %8.8X{increment1}MB."
            },
        },
        "debug_to_con": {
            type: "logLevelFilter",
            appender: "console",
            level: "debug",
        }
    },
    categories: {
        "default": {appenders: ["dateLog"], level: "debug"},
        "con": {appenders: ["console"], level: "debug"},
        "dataEntry": {appenders: ["dataEntryCSV","dataEntryLog","dataEntryCon"], level: "debug"},
        "cy": {appenders: ["dateLog","debug_to_con"], level: "trace"},
    }
})
// module.exports=log4js.getLogger;
module.exports = (/* maybe a param here for classification */) => {
    return {
        conLogger: log4js.getLogger("con"),
        cyLogger: log4js.getLogger("cy"),
        dataEntryLogger: log4js.getLogger("dataEntry"),
    }
};