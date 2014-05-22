var http = require("http");
var io = require("socket.io");
var irc = require("irc");
var fs = require("fs");
var irc_config = require("./irc_config.json");
var irc_lines = new Array();
var spoken = new Object();
var channel = irc_config.options.channels[0];
var bot = new irc.Client(irc_config.server, irc_config.botName, irc_config.options);

var serv_io = io.listen(9999);

//This line is only needed on CloudFlare which does not yet (Mar 2014) support WebSockets.
serv_io.set('transports', ['xhr-polling']);

bot.on('raw', function(m) {
	serv_io.sockets.emit('irc', m);

	if (m.command !== "PING") {
		irc_lines.push(m);
	}
})

bot.on('message'+channel, function(nick, text) {
	if (nick !== irc_config.admin) { 
		return 0;
	}

	var command = text.split(' ');

	switch (command[0]) {
		case '!ban':
			command[1] ? irc_config.bans.push(command[1]) : 0; break;
		case '!unban':
			command[1] ? irc_config.bans.splice(irc_config.bans.indexOf(command[1]), 1) : 0; break;
		default: return 0;
	}

	fs.writeFile("./irc_config.json", JSON.stringify(irc_config, null, "\t"));

});

function clean_irc_lines(){
	irc_lines = irc_lines.slice(-50);
}

setInterval(clean_irc_lines, 60*60*1000)

serv_io.sockets.on("connection", function (socket) {
	var our_lines = irc_lines.slice(-15);

	for (i = 0; i < our_lines.length; i++ ) {
		socket.emit("irc", our_lines[i]);
	}

	socket.on('chat', function(data) {
		// Note: cf-connecting-ip when using CloudFlare; this is dependant on your webserver setup. You may also have to parse X-Forwarded-For.
		var ip = socket.handshake.headers['cf-connecting-ip'];
		var formatted_msg = ip + ': ' + data.msg;
		var now = new Date();
		if (spoken[ip]) {
			var t = new Date(spoken[ip]);
			t.setTime(t.getTime() + (10*1000));
		} else {
			var t = false;
		}

		console.log(t);
		console.log(now);

		if (!~irc_config.bans.indexOf(ip) && (!t || t < now)) {
			spoken[ip] = new Date();
			bot.say(channel, formatted_msg);
			var a = new Array();
			a[0] = channel;
			a = a.concat(data.msg.split(' '));

			m = {
				command: "PRIVMSG",
				nick: ip,
				args: a
			}

			console.log(m);

			serv_io.sockets.emit('irc', m);
			irc_lines.push(m);
		}
	});
});

bot.connect();
