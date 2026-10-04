// Embeds the app icon into the packaged .exe. electron-builder skips this when
// signAndEditExecutable is false (which avoids its winCodeSign download), so do it directly with rcedit.
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { rcedit } = await import("rcedit");
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await rcedit(exe, { icon: path.join(__dirname, "icon.ico") });
};
