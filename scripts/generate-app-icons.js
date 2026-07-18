/**
 * One-shot: rasterize the MDI "cookie" glyph into Pinch app icon assets.
 * Same icon as MaterialCommunityIcons "cookie" from @expo/vector-icons.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'assets');
const images = path.join(root, 'images');
const cookieSvgPath = path.join(images, 'cookie-icon.svg');
const cookieSvg = fs.readFileSync(cookieSvgPath);

const BG = '#F8F4F6';
const PRIMARY = '#C45B7A';

async function cookiePng(size, color = PRIMARY) {
  const svg = Buffer.from(
    cookieSvg.toString().replace(/fill="#[A-Fa-f0-9]{6}"/, `fill="${color}"`),
  );
  return sharp(svg, { density: 512 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function main() {
  const cookie640 = await cookiePng(640);
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: BG },
  })
    .composite([{ input: cookie640, gravity: 'centre' }])
    .png()
    .toFile(path.join(images, 'icon.png'));

  const cookie720 = await cookiePng(720);
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cookie720, gravity: 'centre' }])
    .png()
    .toFile(path.join(images, 'android-icon-foreground.png'));

  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: BG },
  })
    .png()
    .toFile(path.join(images, 'android-icon-background.png'));

  const mono720 = await cookiePng(720, '#FFFFFF');
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mono720, gravity: 'centre' }])
    .png()
    .toFile(path.join(images, 'android-icon-monochrome.png'));

  const splashCookie = await cookiePng(200);
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: splashCookie, gravity: 'centre' }])
    .png()
    .toFile(path.join(images, 'splash-icon.png'));

  const favCookie = await cookiePng(36);
  await sharp({
    create: { width: 48, height: 48, channels: 4, background: BG },
  })
    .composite([{ input: favCookie, gravity: 'centre' }])
    .png()
    .toFile(path.join(images, 'favicon.png'));

  const iosSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white">
  <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3M9.5,6A1.5,1.5 0 0,1 11,7.5A1.5,1.5 0 0,1 9.5,9A1.5,1.5 0 0,1 8,7.5A1.5,1.5 0 0,1 9.5,6M6.5,10A1.5,1.5 0 0,1 8,11.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 5,11.5A1.5,1.5 0 0,1 6.5,10M11.5,11A1.5,1.5 0 0,1 13,12.5A1.5,1.5 0 0,1 11.5,14A1.5,1.5 0 0,1 10,12.5A1.5,1.5 0 0,1 11.5,11M16.5,13A1.5,1.5 0 0,1 18,14.5A1.5,1.5 0 0,1 16.5,16H16.5A1.5,1.5 0 0,1 15,14.5H15A1.5,1.5 0 0,1 16.5,13M11,16A1.5,1.5 0 0,1 12.5,17.5A1.5,1.5 0 0,1 11,19A1.5,1.5 0 0,1 9.5,17.5A1.5,1.5 0 0,1 11,16Z"/>
</svg>
`;
  fs.writeFileSync(path.join(root, 'expo.icon', 'Assets', 'cookie.svg'), iosSvg);

  console.log('Icons written OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
