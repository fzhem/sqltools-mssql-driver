const utilModule = ((() => {
  const { QueryAggregator } = require('./query-aggregator');
  const { SchemaSplitter } = require('./shema-splitter');

  // Get the Node.js version, module version, platform, and architecture
  const nodeVersion = process.version; // Node.js version (e.g., 'v20.0.0')
  const moduleVersion = parseInt(process.versions.modules, 10); // Module version (e.g., 131)
  const platform = process.platform; // Platform (e.g., 'win32', 'linux')
  const arch = process.arch; // Architecture (e.g., 'x64', 'arm64')

  // Determine the folder name based on module version
  let folder;

  if (moduleVersion >= 131) {
    folder = `v131`;
  } else if (moduleVersion >= 127) {
    folder = `v127`;
  } else if (moduleVersion >= 120) {
    folder = `v120`;
  } else if (moduleVersion >= 115) {
    folder = `v115`;
  } else {
    throw new Error(`Unsupported Node.js module version: ${moduleVersion} (Node.js version: ${nodeVersion}, Platform: ${platform}, Architecture: ${arch})`);
  }

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
