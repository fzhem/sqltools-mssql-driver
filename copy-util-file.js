const fs = require('fs');
const path = require('path');

// Define source and destination paths
const sourceFilePath = path.join(__dirname, 'util.js'); // util.js in the root folder
const targetFilePath = path.join(__dirname, 'node_modules', 'msnodesqlv8', 'lib', 'util.js'); // Target util.js

// Function to copy the file
const copyUtilFile = () => {
  try {
    // Check if the source util.js exists
    if (!fs.existsSync(sourceFilePath)) {
      console.error('Error: Source file util.js does not exist in the root folder.');
      return;
    }

    // Check if the target directory exists
    const targetDir = path.dirname(targetFilePath);
    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Target directory ${targetDir} does not exist.`);
      return;
    }

    // Copy the util.js file
    fs.copyFileSync(sourceFilePath, targetFilePath);
    console.log(`Successfully replaced util.js in ${targetFilePath}`);
  } catch (error) {
    console.error(`Error replacing util.js: ${error.message}`);
  }
};

// Run the copy function
copyUtilFile();
