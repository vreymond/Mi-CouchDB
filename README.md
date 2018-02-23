# Mi-CouchDB
Insert huge amount of splitted data inside couchDB (bulk)

## Requirements

- CouchDB
- Node.js
- NPM packages : nano, commander, jsonfile, uuid, async


## Installation

```
git clone https://github.com/vreymond/Mi-CouchDB.git
npm install
```


## Run

You can only run this script with one command option -f (run with a file) or -r (run with the test option).
If both arguments passed to the script, the -f (or --file) will be the priority and it will overwrite the test documents. 


### Help command

Access to the help documentation for a list of command:

```
node index.js -h
```


### Example

Run this following command to execute the test file

```
node index.js
	-f ./test/intact_noExpansion.mitab_top100.json
```


## Tests

In the `./test/` directory, some JSON files to run.




