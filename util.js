const utilModule = ((() => {
  const { QueryAggregator } = require('./query-aggregator');
  const { SchemaSplitter } = require('./shema-splitter');

  // Get the Node.js version, module version, platform, and architecture
  const nodeVersion = process.version; // Node.js version (e.g., 'v20.0.0')
  const moduleVersion = parseInt(process.versions.modules, 10); // Module version (e.g., 131)
  const platform = process.platform; // Platform (e.g., 'win32', 'linux')
  const arch = process.arch; // Architecture (e.g., 'x64', 'arm64')

  const supportedVersions = [131, 128, 127, 125, 123, 121, 120, 115];

  // Find the highest supported version that is <= moduleVersion
  const folderVersion = supportedVersions.find(version => moduleVersion >= version);

  if (!folderVersion) {
    throw new Error(`Unsupported module version: ${moduleVersion} (Node.js version: ${nodeVersion}, Platform: ${platform}, Architecture: ${arch})`);
  }

  const folder = `v${folderVersion}`;

  // Load the native module from the dynamically constructed path
  const cppDriver = require(`../build/Release/${folder}/sqlserverv8.node`);

  class Native {
    constructor () {
      this.cppDriver = cppDriver;
    }
  }

  return {
    QueryAggregator,
    SchemaSplitter,
    Native,
  };
})());

exports.utilModule = utilModule;
