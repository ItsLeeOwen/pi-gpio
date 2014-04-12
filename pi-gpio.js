"use strict";
var fs = require("fs"),
	path = require("path"),
    Q = require('q'),
	ChildProcess = require("child_process");

var gpioAdmin = "gpio-admin",
	sysFsPath = "/sys/devices/virtual/gpio";

var rev = fs.readFileSync("/proc/cpuinfo").toString().split("\n").filter(function(line) {
	return line.indexOf("Revision") == 0;
})[0].split(":")[1].trim();

rev = parseInt(rev, 16) < 3 ? 1 : 2; // http://elinux.org/RPi_HardwareHistory#Board_Revision_History

var pinMapping = {
	"3": 0,
	"5": 1,
	"7": 4,
	"8": 14,
	"10": 15,
	"11": 17,
	"12": 18,
	"13": 21,
	"15": 22,
	"16": 23,
	"18": 24,
	"19": 10,
	"21": 9,
	"22": 25,
	"23": 11,
	"24": 8,
	"26": 7
};

if(rev == 2) {
	pinMapping["3"] = 2;
	pinMapping["5"] = 3;
	pinMapping["13"] = 27;
}

function exec(command) {
    var deferred = Q.defer();
    ChildProcess.exec(command, function(error, stdout, stderr) {
        if(error) {
            error.message = stderr;
            deferred.reject(error);
        } else {
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

function isNumber(number) {
	return !isNaN(parseInt(number, 10));
}

function sanitizePinNumber(pinNumber) {
	if(!isNumber(pinNumber) || !isNumber(pinMapping[pinNumber])) {
		throw new Error("Pin number isn't valid");
	}

	return parseInt(pinNumber, 10);
}

function sanitizeDirection(direction) {
	direction = (direction || "").toLowerCase().trim();
	if(direction === "in" || direction === "input") {
		return "in";
	} else if(direction === "out" || direction === "output" || !direction) {
		return "out";
	} else {
		throw new Error("Direction must be 'input' or 'output'");
	}
}

function sanitizeOptions(options) {
	var sanitized = {};

	options.split(" ").forEach(function(token) {
		if(token == "in" || token == "input") {
			sanitized.direction = "in";
		}

		if(token == "pullup" || token == "up") {
			sanitized.pull = "pullup";
		}

		if(token == "pulldown" || token == "down") {
			sanitized.pull = "pulldown";
		}
	});

	if(!sanitized.direction) {
		sanitized.direction = "out";
	}

	if(!sanitized.pull) {
		sanitized.pull = "";
	}

	return sanitized;
}

var gpio = {
	rev: rev,
	
	open: function(pinNumber, options) {
		pinNumber = sanitizePinNumber(pinNumber);

		if(!options)
			options = "out";

		options = sanitizeOptions(options);

        return exec(gpioAdmin + " export " + pinMapping[pinNumber] + " " + options.pull)
            .then(function() {
                return gpio.setDirection(pinNumber, options.direction);
            })
            .fail(function(error) {
                switch (error.code) {
                    case 4:
                        return gpio.setDirection(pinNumber, options.direction);
                        break;
                    default:
                        console.error("Error opening pin", pinNumber);
                        console.error(error.message);
                        throw error;
                }
            })
	},

	setDirection: function(pinNumber, direction) {
        var deferred = Q.defer();
        pinNumber = sanitizePinNumber(pinNumber);
        direction = sanitizeDirection(direction);

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", direction, function(error) {
            if (error)
                deferred.reject(new Error(error));
            else
                deferred.resolve();
        });
        return deferred.promise;
	},

	getDirection: function(pinNumber) {
        var deferred = Q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", "utf8", function(err, direction) {
            if (error)
                deferred.reject(new Error(error));
            else
                deferred.resolve(sanitizeDirection(direction.trim()));
		});
        return deferred.promise;
	},

	close: function(pinNumber) {
		pinNumber = sanitizePinNumber(pinNumber);

		return exec(gpioAdmin + " unexport " + pinMapping[pinNumber])
            .fail(function(error) {
                console.error("Error closing pin", pinNumber);
                console.error(error.message);
                throw error;
            })
	},

	read: function(pinNumber) {
        var deferred = Q.defer();
		pinNumber = sanitizePinNumber(pinNumber);
		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", function(error, data) {
            if (error)
                deferred.reject(error);
            else {
                deferred.resolve(parseInt(data, 10));
            }
		});
        return deferred.promise;
	},

	write: function(pinNumber, value) {
        var deferred = Q.defer();
		pinNumber = sanitizePinNumber(pinNumber);

		value = !!value ? "1" : "0";

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", value, "utf8", function(error) {
            if (error)
                deferred.reject(new Error(error));
            else
                deferred.resolve();
        });
        return deferred.promise;
	}
};

gpio.export = gpio.open;
gpio.unexport = gpio.close;

module.exports = gpio;
