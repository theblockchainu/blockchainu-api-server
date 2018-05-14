const app = require('./server');
var web3 = require('web3');
var contract = require("truffle-contract");
var net = require('net');

exports = module.exports = function (app) {
	
	if (process.env.NODE_ENV === 'development') {
		web3 = new web3(new web3.providers.HttpProvider("http://127.0.0.1:7545"));
	} else {
		web3 = new web3(new web3.providers.IpcProvider('/geth/geth.ipc', net));
	}
	
	let collectionContractInstance;
	let karmaContractInstance;
	let gyanContractInstance;
	
	loadContracts();
	
	function loadContracts() {
		// Collection Contract
		const CollectionContractArtifact = require("./contracts/CollectionContract.json");
		const CollectionContract = contract(CollectionContractArtifact);
		CollectionContract.setProvider(web3.currentProvider);
		if (typeof CollectionContract.currentProvider.sendAsync !== "function") {
			CollectionContract.currentProvider.sendAsync = function() {
				return CollectionContract.currentProvider.send.apply(
						CollectionContract.currentProvider, arguments
				);
			};
		}
		CollectionContract.defaults({from: app.get('blockProducerAddress'), gas: 3000000});
		web3.eth.personal.unlockAccount(app.get('blockProducerAddress'), app.get('blockProducerPassword'));
		CollectionContract.deployed()
				.then(function (instance) {
					console.log('got contract instance of collection');
					collectionContractInstance = instance;
					return instance;
				})
				.catch(err => {
					console.error(err);
				});
		
		// Karma Contract
		const KarmaContractArtifact = require("./contracts/KarmaCoin.json");
		const KarmaContract = contract(KarmaContractArtifact);
		KarmaContract.setProvider(web3.currentProvider);
		if (typeof KarmaContract.currentProvider.sendAsync !== "function") {
			KarmaContract.currentProvider.sendAsync = function() {
				return KarmaContract.currentProvider.send.apply(
						KarmaContract.currentProvider, arguments
				);
			};
		}
		KarmaContract.defaults({from: app.get('blockProducerAddress'), gas: 3000000});
		web3.eth.personal.unlockAccount(app.get('blockProducerAddress'), app.get('blockProducerPassword'));
		KarmaContract.deployed()
				.then(function (instance) {
					console.log('got contract instance of karma');
					karmaContractInstance = instance;
					return instance;
				})
				.catch(err => {
					console.error(err);
				});
		
		// Gyan Contract
		const GyanContractArtifact = require("./contracts/GyanCoin.json");
		const GyanContract = contract(GyanContractArtifact);
		GyanContract.setProvider(web3.currentProvider);
		if (typeof GyanContract.currentProvider.sendAsync !== "function") {
			GyanContract.currentProvider.sendAsync = function() {
				return GyanContract.currentProvider.send.apply(
						GyanContract.currentProvider, arguments
				);
			};
		}
		GyanContract.defaults({from: app.get('blockProducerAddress'), gas: 3000000});
		web3.eth.personal.unlockAccount(app.get('blockProducerAddress'), app.get('blockProducerPassword'));
		GyanContract.deployed()
				.then(function (instance) {
					console.log('got contract instance of gyan');
					gyanContractInstance = instance;
					return instance;
				})
				.catch(err => {
					console.error(err);
				});
	}
	
	app.getCollectionContractInstance = function() {
		return collectionContractInstance;
	};
	
	app.getKarmaContractInstance = function() {
		return karmaContractInstance;
	};
	
	app.getGyanContractInstance = function() {
		return gyanContractInstance;
	}
	
};
