const https = require('https');
const fs = require('fs');
const path = require('path');
const tar = require('tar');

// Define parameters
const supportedVersions = [115, 120, 127, 131];
// Read the package.json file
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Extract the msnodesqlv8 version
const msnodesqlv8Version = packageJson.dependencies['msnodesqlv8'];
const version = msnodesqlv8Version.replace('^', '');
const platform = process.platform;
const arch = process.arch;
const baseUrl = `https://github.com/TimelordUK/node-sqlserver-v8/releases/download/v${version}`;

// Target directory for copying the node file
const targetBaseDir = path.join(__dirname, 'node_modules', 'msnodesqlv8', 'build', 'Release');

// Function to download the file with redirect handling
const downloadFile = (url, destination, redirectCount = 0) => {
  const MAX_REDIRECTS = 5;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects for URL: ${url}`));
          return;
        }
        const newUrl = response.headers.location;
        file.close();
        console.log(`Redirected to: ${newUrl}`);
        return resolve(downloadFile(newUrl, destination, redirectCount + 1));
      } else if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (error) => {
      fs.unlink(destination, () => reject(error));
    });
  });
};

// Function to extract the .tar.gz file
const extractTarGz = (filePath, extractTo) => {
    // Ensure the target extraction directory exists
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }
  
    return tar.x({
      file: filePath,
      cwd: extractTo, // Extract to the specified directory
    });
  };
  

// Iterate over each supported version
supportedVersions.forEach(async (moduleVersion) => {
  const fileName = `msnodesqlv8-v${version}-node-v${moduleVersion}-${platform}-${arch}.tar.gz`;
  const fileUrl = `${baseUrl}/${fileName}`;
  const filePath = path.join(__dirname, fileName);
  const tempExtractDir = path.join(__dirname, `temp_v${moduleVersion}`);

  try {
    // Download the .tar.gz file
    console.log(`Attempting to download: ${fileName}`);
    await downloadFile(fileUrl, filePath);
    console.log(`Downloaded: ${fileName} to ${filePath}`);

    // Extract the .tar.gz to a temporary directory
    console.log(`Extracting ${fileName} to ${tempExtractDir}`);
    await extractTarGz(filePath, tempExtractDir);

    // Copy the extracted sqlserverv8.node file to the target directory
    const extractedFilePath = path.join(tempExtractDir, 'build', 'Release', 'sqlserverv8.node');
    const targetDir = path.join(targetBaseDir, `v${moduleVersion}`);
    const targetFilePath = path.join(targetDir, 'sqlserverv8.node');

    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy the node file to the target directory
    fs.copyFileSync(extractedFilePath, targetFilePath);
    console.log(`Copied sqlserverv8.node to ${targetFilePath}`);

    // Clean up temporary files
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    fs.unlinkSync(filePath);
    console.log(`Cleaned up temporary files for v${moduleVersion}`);
  } catch (error) {
    console.error(`Error processing version v${moduleVersion}: ${error.message}`);
  }
});
