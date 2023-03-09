const fetch = require("node-fetch");
fetch("http://kskw.ahu.edu.cn/bkcx.asp?xh=E03114222", {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
    }).then(response=>response.text()).then(response=>{console.log(response)});