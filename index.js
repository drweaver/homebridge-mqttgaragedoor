// MQTT Switch Accessory plugin for HomeBridge
//
// Remember to add accessory to config.json. Example:
// "accessories": [
//     {
//            "accessory": "mqttswitch",
//            "name": "PUT THE NAME OF YOUR SWITCH HERE",
//            "url": "PUT URL OF THE BROKER HERE",
//			  "username": "PUT USERNAME OF THE BROKER HERE",
//            "password": "PUT PASSWORD OF THE BROKER HERE"
// 			  "caption": "PUT THE LABEL OF YOUR SWITCH HERE",
// 			  "topics": {
// 				"statusGet": 	"PUT THE MQTT TOPIC FOR THE GETTING THE STATUS OF YOUR SWITCH HERE",
// 				"statusSet": 	"PUT THE MQTT TOPIC FOR THE SETTING THE STATUS OF YOUR SWITCH HERE"
// 			  }
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

'use strict';

var Service, Characteristic;
var mqtt = require("mqtt");


function MqttGarageAccessory(log, config) {
  	this.log          	= log;
  	this.name 			= config["name"];
  	this.url 			= config["url"];
	this.client_Id 		= 'mqttjs_' + Math.random().toString(16).substr(2, 8);
	this.options = {
	    keepalive: 10,
    	clientId: this.client_Id,
	    protocolId: 'MQTT',
    	protocolVersion: 4,
    	clean: true,
    	reconnectPeriod: 1000,
    	connectTimeout: 30 * 1000,
		will: {
			topic: 'WillMsg',
			payload: 'Connection Closed abnormally..!',
			qos: 0,
			retain: false
		},
	    username: config["username"],
	    password: config["password"],
    	rejectUnauthorized: false
	};
	this.caption		= config["caption"];
	this.topicStatusGet	= config["topics"].statusGet; // the target value sent to HomeKit
	this.topicStatusSet	= config["topics"].statusSet; // the target value for door state

	this.CachedGarageDoorState = Characteristic.CurrentDoorState.CLOSED; // 1 = closed
	this.CachedGarageTargetDoorState = Characteristic.CurrentDoorState.CLOSED; // 1 = closed   
    
	this.service = new Service.GarageDoorOpener(this.name);

    /*   	this.service
    	.getCharacteristic(Characteristic.On)
    	.on('get', this.getStatus.bind(this))
    	.on('set', this.setStatus.bind(this));
    */
    
    this.service.getCharacteristic( Characteristic.CurrentDoorState ).on(    'get', this.getDoorPositionState.bind(this) );
    this.service.getCharacteristic( Characteristic.TargetDoorState ).on(     'get', this.getDoorTargetPositionState.bind(this) );
    this.service.getCharacteristic( Characteristic.ObstructionDetected ).on( 'get', this.getObstructionDetected.bind(this) );
    this.service.getCharacteristic( Characteristic.TargetDoorState ).on(     'set', this.setDoorTargetPosition.bind(this) );
	
	// connect to MQTT broker
	this.client = mqtt.connect(this.url, this.options);
	var that = this;
	this.client.on('error', function () {
		that.log('Error event on MQTT');
	});

	this.client.on('message', function (topic, message) {
        that.log( "Got MQTT! garage" );
		if (topic == that.topicStatusGet) {
			var status = message.toString();
			that.CachedGarageDoorState = status;
		   	that.service.getCharacteristic(Characteristic.CurrentDoorState).setValue(that.CachedGarageDoorState, undefined, 'fromSetValue');
		}
	});
    this.client.subscribe(this.topicStatusGet);
}

module.exports = function(homebridge) {
  	Service = homebridge.hap.Service;
  	Characteristic = homebridge.hap.Characteristic;
  
  	homebridge.registerAccessory("homebridge-mqttgarage", "Mqttgarage", MqttGarageAccessory);
}

MqttGarageAccessory.prototype.getDoorPositionState = function(callback) {
    this.log("getDoorPosition");
    callback(null, this.CachedGarageDoorState);
}

MqttGarageAccessory.prototype.getDoorTargetPositionState = function(callback) {
    this.log("getDoorTargetPosition");
    callback(null, this.CachedGarageTargetDoorState);
}

MqttGarageAccessory.prototype.setDoorTargetPosition = function(status, callback, context) {
    this.log("setDoorTargetPosition");
    this.CachedGarageTargetDoorState = status;
	this.client.publish(this.topicStatusSet, String(status) ); // send MQTT packet for new state
	callback();
}

MqttGarageAccessory.prototype.getObstructionDetected = function(callback) {
    this.log("getObstructionDetected");
    callback(null, false); // no sensor, always false
}

MqttGarageAccessory.prototype.getServices = function() {
  return [this.service];
}