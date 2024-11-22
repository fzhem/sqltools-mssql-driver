const fs = require('fs');
const path = require('path');

// Path to the directory containing the target file
const targetDir = path.join(__dirname, 'node_modules', 'msnodesqlv8', 'build', 'Release');
const targetFile = path.join(targetDir, 'sqlserverv8.node');

// Function to delete the file if it exists
const deleteSqlServerNode = () => {
  if (fs.existsSync(targetFile)) {
    try {
      fs.unlinkSync(targetFile);
      console.log(`Deleted file: ${targetFile}`);
    } catch (err) {
      console.error(`Error deleting file: ${err.message}`);
    }
  } else {
    console.log(`File not found: ${targetFile}`);
  }
};

// Execute the deletion function
deleteSqlServerNode();
