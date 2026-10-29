// Reads app.json and drops the Firebase file setting when google-services.json is not there yet, so the app still
// builds in local demo mode (no real Google sign-in, push or communities). Add the file and rebuild for the full app.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const android = { ...config.android };
  if (!fs.existsSync(path.join(__dirname, 'google-services.json'))) delete android.googleServicesFile;
  return { ...config, android };
};
