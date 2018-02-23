/*
	* 	Script to insert a huge amount of data in couchDB structure.
	*	This program use a split method to avoid the database overloading.
	*	Nevertheless, there is a limit to the input file size, this cannot be higher than 256mb,
	*	because there is a limit to the "toString()" function.
	* 	To bypass this, you must split your input data and call this script as much as parts you 
	*	splited your file.

	*	23/02/2018
*/

// Requirements part
const EventEmitter = require('events');
let nano = require('nano')('http://vreymond:couch@localhost:5984');
let program = require('commander');
let fs = require('fs');
let jsonfile = require('jsonfile');
let async = require ('async');
var uuid = require('uuid/v4');

/* 
* Initialisation of some global variables that needed into functions
* @debugMode : Boolean that activate debug mode
* @nameDB : Use this to give a name to the couchDB database
* @fileDB : Default is null, if -f (or --file) command called, this variable will store the path of the file
* @emitterDB : Instance of EventEmitter() class
* @random : Boolean that activate the test mode with random data
* @loadBalNum : Load balancing value. Default is 500, you can change this value by using the --lbn command 
*/
var debugMode = false;
var nameDB = 'dbtest'
let fileDB = null;
let emitterDB = new EventEmitter();
var random = false;
var loadBalNum = 500;

// Commander package options definition with documentation. Use -h or --help to access this documentation
program
	.option('-f, --file <path>', 'Path to json file to to populate the couchDB [optional]')
	.option("-r, --random", "Insertion with random data [optional]")
	.option("--lbn <number>", "Number of splited document, default is 500 [optional]")
	.option("--debug", "debug mode [optional]")
	.parse(process.argv);

// Variable values assignment when command options given in arguments
if (program.file && program.file != "") fileDB = program.file;
if (program.debug) debugMode = true;
if (program.random) random = true;
if (program.lbn) loadBalNum = program.lbn;

// If database with nameDB already exist, destroy it and recreate it
nano.db.destroy(nameDB, function(err) {
	if (err && err.statusCode != 404){
		if (debugMode) {
			console.log('err')
			console.log(err)
		}
		throw 'FAILED: Destroying ' + nameDB +' database' 
	}
	//console.log('SUCESS: Database destroyed')
	nano.db.create(nameDB, function(err) {
		if (err){
			if (debugMode) {
				console.log('err')
				console.log(err)
			}
			throw 'FAILED: Creation of database';
		}
		//console.log('SUCESS: Database ' + nameDB + ' created');
		let db = nano.use(nameDB);
		emitterDB.emit('created');
	})
})

/*
* Once database created, we got two choice:
*	- if -r or --random is given, we start the test mode with random data
*	- if -f or --file is given, we start building the databse from a specific file
* If both options given in arguments, the -f (file) will be the priority, explained
* by the fact that the asignment of the myArray variable occured twice. The second time
* is equivalent to the file section, and it will overwrite the first assignment from
* the random option.
*/
emitterDB.on('created', () => {
	let myArray = [];
	/////////////// In case of test couch lambda ////////////////
	if (random) {
		//myArray = createLambdas(100000, 1000, 1000000); // reality (not working yet)
		myArray = createLambdas(1000, 50, 1000000); // for tests, adding 50000 docs into the database
	}

	/////////////// In case of file ////////////////
	if (fileDB !== null) {
		// open file
		try { var fileSize = fs.statSync(fileDB); }
		catch (err) { throw err; }

		// check size of file
		if (fileSize.size < 1){ throw 'Empty file given in args'; }
		else{
			// file not empty
			try { var dataFile = jsonfile.readFileSync(fileDB); }
			catch(err) { throw err; }
			if(dataFile.data){
				myArray = dataFile.data;
				// addToDB(myArray, nameDB); // previous version
			}
			else{
				throw 'FAILED: Format not accepted by the database'
			}
		}
	}
	feedCouch(myArray);
})

/*
* Function to add some data into the database
* @data : Array of documents attempt to be insert in couchDB
* @nameDB : Database name
*
* The bulk method from nano package, allows us to insert an array of documents by using
* only one request, instead of one request per element of the data array. The bulk needs
* a particular Json structure which is: {docs: dataArray} to be functional.
*/
function addToDB (data, nameDB) {
	if (debugMode) {
		console.log("data")
		console.log(data)
		console.log("end of data")
	}
	if (typeof data == "undefined") throw 'No @data specified';
	//if (typeof nameDB == "undefined") throw 'No @nameDB specified';
	let addEmitter = new EventEmitter();
	let db = nano.use(nameDB);
	let docList = [];
	// Test is data is a list
	if(Array.isArray(data)){
		docList = data;
	}
	else{
		docList.push(data);
	}
	let counter = 0;
	// Calling the bulk method from nano
	db.bulk({docs: docList}, function(err, body) {
       	if (err) {
           	console.log('FAILED: Insertion from file in database ', err.message);
           	addEmitter.emit('addFailed', err);
            return;
        }
        if (debugMode) {
    		console.log('SUCESS: Insertion data from file in ' + nameDB );

    	}
    	counter++;
    	// Once counter equal the length of the data array, we emit the addSucceed event
    	if (counter == docList.length) addEmitter.emit('addSucceed', 'SUCESS: Insertion');
    });
	return addEmitter;
}

/*
* Function to create doc of homologous interactions, in order to test couchDB resistance.
* @numberLambdas <number> : number of lambda proteins
* @numberHomologous <number> : number of different homologous proteins we want
* @blastOutNumber <number> : number of results from Blast
*/
function createLambdas(numberLambdas, blastOutNumber, numberHomologous){
	let arrayJsons = [];

	// feed the array
	for (let elem = 0; elem < numberLambdas; elem++){ // for each lambda protein
		for (let i =0; i < blastOutNumber; i ++){ // for each result of Blast
			// choose a number between 0 and @numberHomologous
			let rand = Math.floor(Math.random() * numberHomologous + 1);
			let myjson = {"_id": uuid(), "from": elem, "to": rand}
			arrayJsons.push(myjson);
		}
	}
	return arrayJsons;
}

/*
* Function that split the data file into small array with of a length of @loadBalNum value
* @arrayJsons : Array of the data from a file or from the test method (random data)
*
* This function use the async package with the eachSeries method that run only a single
* async operation at a time. This method wait for the end on the previously async call
* before launch the next tick (next() function). We need to put the setImmediate()
* function before the next function because we need to have asynchronous callback.
* async.eachSeries only behaves asynchronously if the callback inside it is called asynchronously,
* that explained the setImmediate requirement.
* Note that we can replace the setImmediate(() => {next()}); by process.nextTick(next);
* process.nextTick has the potential to block the loop event from processing any other tasks, because he
* queues the callback as a microtask. setImmediate queues as a macrotask.
*/
function feedCouch (arrayJsons) {
	let chunkArray = [];
	let arrayLoadBal = [];
	// For each element of the data array
	for (let elem of arrayJsons) {
		if (debugMode) console.log(elem)
		chunkArray.push(elem)
		// for loadBallancing : last condition is for the last iteration (equivalent to modulo)
		if(chunkArray.length == loadBalNum || arrayJsons.indexOf(elem) == arrayJsons.length -1) {
			if (debugMode) console.log(arrayLoadBal)
			arrayLoadBal.push(chunkArray);
			chunkArray = [];
		}
	}
	// Calling async eachSeries to add splited data with the addToDB function
	async.eachSeries(
		arrayLoadBal, // array
		// You can use process.nextTick(next) insted of setImmediate(() => {next()});
		(e, next) => { console.log('----\n', e); addToDB(e, nameDB); setImmediate(() => {next()}); }, // function to execute
		() => { console.log('Done'); } // at the end
	)
}






