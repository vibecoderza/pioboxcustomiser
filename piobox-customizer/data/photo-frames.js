// Garment bounding boxes inside each product photo (fractions of the image).
// w/h = box size, cx/cy = box center, ar = photo aspect ratio. Used to map print zones onto the photo.
export const PHOTO_FRAMES = {
 "apron-black.webp": {
  "w": 0.3984,
  "h": 0.9844,
  "cx": 0.5,
  "cy": 0.4961,
  "ar": 1
 },
 "apron-white.webp": {
  "w": 0.4414,
  "h": 0.9805,
  "cx": 0.498,
  "cy": 0.498,
  "ar": 1
 },
 "backpack-black.webp": {
  "w": 0.6602,
  "h": 0.9453,
  "cx": 0.4941,
  "cy": 0.4961,
  "ar": 1
 },
 "backpack-white.webp": {
  "w": 0.7656,
  "h": 0.8906,
  "cx": 0.4922,
  "cy": 0.5,
  "ar": 1
 },
 "badge-holder-black.webp": {
  "w": 0.5078,
  "h": 0.8359,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "badge-holder-clear.webp": {
  "w": 0.5391,
  "h": 0.8828,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "bandana-black.webp": {
  "w": 0.7656,
  "h": 0.8828,
  "cx": 0.5234,
  "cy": 0.5156,
  "ar": 1
 },
 "bandana-white.webp": {
  "w": 0.7266,
  "h": 0.875,
  "cx": 0.5039,
  "cy": 0.5117,
  "ar": 1
 },
 "beanie-black.webp": {
  "w": 0.6953,
  "h": 0.793,
  "cx": 0.5078,
  "cy": 0.498,
  "ar": 1
 },
 "beanie-white.webp": {
  "w": 0.7344,
  "h": 0.8281,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "black-jogger-sweatpant.webp": {
  "w": 0.5078,
  "h": 0.9492,
  "cx": 0.5,
  "cy": 0.5059,
  "ar": 1
 },
 "blanket-black.webp": {
  "w": 0.7852,
  "h": 0.9219,
  "cx": 0.502,
  "cy": 0.5,
  "ar": 1
 },
 "blanket-white.webp": {
  "w": 0.7813,
  "h": 0.918,
  "cx": 0.5039,
  "cy": 0.5059,
  "ar": 1
 },
 "canvas-tote-back-black.webp": {
  "w": 0.5273,
  "h": 0.8945,
  "cx": 0.498,
  "cy": 0.4863,
  "ar": 1
 },
 "canvas-tote-back-white.webp": {
  "w": 0.5313,
  "h": 0.8945,
  "cx": 0.5,
  "cy": 0.4941,
  "ar": 1
 },
 "cap-black.webp": {
  "w": 0.7617,
  "h": 0.7578,
  "cx": 0.498,
  "cy": 0.4727,
  "ar": 1
 },
 "cap-white.webp": {
  "w": 0.7617,
  "h": 0.7656,
  "cx": 0.498,
  "cy": 0.4727,
  "ar": 1
 },
 "classic-tee-back-black.webp": {
  "w": 0.9258,
  "h": 0.9297,
  "cx": 0.498,
  "cy": 0.4961,
  "ar": 1
 },
 "classic-tee-back-white.webp": {
  "w": 0.9141,
  "h": 0.9102,
  "cx": 0.5,
  "cy": 0.4941,
  "ar": 1
 },
 "classic-t-shirt-back-black.webp": {
  "w": 0.9266,
  "h": 0.9306,
  "cx": 0.4984,
  "cy": 0.494,
  "ar": 1
 },
 "classic-t-shirt-back-white.webp": {
  "w": 0.9147,
  "h": 0.9067,
  "cx": 0.4996,
  "cy": 0.4916,
  "ar": 1
 },
 "classic-t-shirt-front-black.webp": {
  "w": 0.9238,
  "h": 0.9277,
  "cx": 0.5,
  "cy": 0.5029,
  "ar": 1
 },
 "classic-t-shirt-front-white.webp": {
  "w": 0.9092,
  "h": 0.9062,
  "cx": 0.4966,
  "cy": 0.4971,
  "ar": 1
 },
 "clear-water-bottle-black.webp": {
  "w": 0.2695,
  "h": 0.9375,
  "cx": 0.498,
  "cy": 0.5,
  "ar": 1
 },
 "clear-water-bottle.webp": {
  "w": 0.2578,
  "h": 0.9258,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "crew-sock-black.webp": {
  "w": 0.4648,
  "h": 0.8945,
  "cx": 0.5332,
  "cy": 0.5059,
  "ar": 1
 },
 "crew-sock-white.webp": {
  "w": 0.5078,
  "h": 0.9414,
  "cx": 0.5391,
  "cy": 0.498,
  "ar": 1
 },
 "crewneck-back-black.webp": {
  "w": 0.9141,
  "h": 0.8516,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "crewneck-back-white.webp": {
  "w": 0.9023,
  "h": 0.8477,
  "cx": 0.498,
  "cy": 0.4941,
  "ar": 1
 },
 "crewneck-normal-black.webp": {
  "w": 0.875,
  "h": 0.9336,
  "cx": 0.5,
  "cy": 0.4941,
  "ar": 1.2407
 },
 "crewneck-white-v2.webp": {
  "w": 0.875,
  "h": 0.8438,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "crop-zip-hoodie-back-black.webp": {
  "w": 0.8398,
  "h": 0.7422,
  "cx": 0.498,
  "cy": 0.4922,
  "ar": 0.8003
 },
 "crop-zip-hoodie-back-white.webp": {
  "w": 0.8906,
  "h": 0.7422,
  "cx": 0.5117,
  "cy": 0.4922,
  "ar": 0.75
 },
 "crop-zip-up-black.webp": {
  "w": 0.8555,
  "h": 0.75,
  "cx": 0.498,
  "cy": 0.5078,
  "ar": 0.7998
 },
 "crop-zip-up-white.webp": {
  "w": 0.832,
  "h": 0.7266,
  "cx": 0.498,
  "cy": 0.4961,
  "ar": 0.7998
 },
 "drop-shoulder-box-tee-back-black.webp": {
  "w": 0.9506,
  "h": 0.8469,
  "cx": 0.5,
  "cy": 0.4968,
  "ar": 1
 },
 "drop-shoulder-box-tee-back-white.webp": {
  "w": 0.9506,
  "h": 0.8469,
  "cx": 0.5,
  "cy": 0.4968,
  "ar": 1
 },
 "drop-shoulder-box-tee-front-black.webp": {
  "w": 0.949,
  "h": 0.8429,
  "cx": 0.5,
  "cy": 0.5004,
  "ar": 1
 },
 "drop-shoulder-box-tee-front-white.webp": {
  "w": 0.949,
  "h": 0.8429,
  "cx": 0.5,
  "cy": 0.5004,
  "ar": 1
 },
 "drop-shoulder-tee-back-black.webp": {
  "w": 0.9531,
  "h": 0.8516,
  "cx": 0.5,
  "cy": 0.4961,
  "ar": 1
 },
 "drop-shoulder-tee-back-white.webp": {
  "w": 0.9414,
  "h": 0.8633,
  "cx": 0.502,
  "cy": 0.502,
  "ar": 1
 },
 "fanny-pack-black.webp": {
  "w": 0.9492,
  "h": 0.5117,
  "cx": 0.502,
  "cy": 0.502,
  "ar": 1
 },
 "fanny-pack-white.webp": {
  "w": 0.9609,
  "h": 0.3789,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "heart-pin-black.webp": {
  "w": 0.7461,
  "h": 0.7422,
  "cx": 0.498,
  "cy": 0.5039,
  "ar": 1
 },
 "heart-pin-white.webp": {
  "w": 0.7578,
  "h": 0.7344,
  "cx": 0.4961,
  "cy": 0.5078,
  "ar": 1
 },
 "heavy-crewneck-back-black.webp": {
  "w": 0.8789,
  "h": 0.6563,
  "cx": 0.498,
  "cy": 0.4883,
  "ar": 0.8003
 },
 "heavy-crewneck-back-white.webp": {
  "w": 0.9531,
  "h": 0.7383,
  "cx": 0.5,
  "cy": 0.4824,
  "ar": 0.7998
 },
 "heavy-crewneck-jet-black.webp": {
  "w": 0.8867,
  "h": 0.8711,
  "cx": 0.5059,
  "cy": 0.4902,
  "ar": 1
 },
 "heavy-crewneck-pfd.webp": {
  "w": 0.875,
  "h": 0.8438,
  "cx": 0.5,
  "cy": 0.4805,
  "ar": 1
 },
 "heavy-hoodie-back-black.webp": {
  "w": 0.8516,
  "h": 0.8125,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 0.8003
 },
 "heavy-hoodie-back-white.webp": {
  "w": 0.8633,
  "h": 0.8125,
  "cx": 0.502,
  "cy": 0.4961,
  "ar": 0.7998
 },
 "heavy-hoodie-jet-black.webp": {
  "w": 0.8438,
  "h": 0.8633,
  "cx": 0.5,
  "cy": 0.5059,
  "ar": 1
 },
 "heavy-hoodie-pfd.webp": {
  "w": 0.8438,
  "h": 0.8633,
  "cx": 0.5,
  "cy": 0.5059,
  "ar": 1
 },
 "heavy-jogger-sweatpant-back-black.webp": {
  "w": 0.5117,
  "h": 0.9609,
  "cx": 0.498,
  "cy": 0.5,
  "ar": 1
 },
 "heavy-jogger-sweatpant-back-white.webp": {
  "w": 0.5078,
  "h": 0.9492,
  "cx": 0.4961,
  "cy": 0.498,
  "ar": 1
 },
 "heavy-jogger-sweatpants-white.webp": {
  "w": 0.5078,
  "h": 0.957,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "heavy-open-leg-sweatpant-back-black.webp": {
  "w": 0.5234,
  "h": 0.9336,
  "cx": 0.4961,
  "cy": 0.502,
  "ar": 1
 },
 "heavy-open-leg-sweatpant-back-white.webp": {
  "w": 0.5664,
  "h": 0.9414,
  "cx": 0.498,
  "cy": 0.502,
  "ar": 1
 },
 "heavy-open-leg-sweatpant-jet-black.webp": {
  "w": 0.5469,
  "h": 0.9297,
  "cx": 0.4961,
  "cy": 0.5039,
  "ar": 1
 },
 "heavy-zip-hoodie-back-black.webp": {
  "w": 0.8359,
  "h": 0.7578,
  "cx": 0.5,
  "cy": 0.5039,
  "ar": 0.8003
 },
 "heavy-zip-hoodie-back-white.webp": {
  "w": 0.8398,
  "h": 0.7578,
  "cx": 0.498,
  "cy": 0.5039,
  "ar": 0.7998
 },
 "high-quality-classic-tee-black.webp": {
  "w": 0.9258,
  "h": 0.9297,
  "cx": 0.502,
  "cy": 0.5039,
  "ar": 1
 },
 "high-quality-classic-tee.webp": {
  "w": 0.9102,
  "h": 0.9102,
  "cx": 0.498,
  "cy": 0.498,
  "ar": 1
 },
 "high-quality-crewneck-2.webp": {
  "w": 0.8828,
  "h": 0.8672,
  "cx": 0.5039,
  "cy": 0.5,
  "ar": 1
 },
 "high-quality-crewneck.webp": {
  "w": 0.8789,
  "h": 0.8516,
  "cx": 0.502,
  "cy": 0.4961,
  "ar": 1
 },
 "high-quality-drop-tee-2.webp": {
  "w": 0.9531,
  "h": 0.8477,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "high-quality-drop-tee.webp": {
  "w": 0.9375,
  "h": 0.8398,
  "cx": 0.5039,
  "cy": 0.498,
  "ar": 1
 },
 "high-quality-jogger-2.webp": {
  "w": 0.4766,
  "h": 0.8203,
  "cx": 0.5,
  "cy": 0.5039,
  "ar": 0.8003
 },
 "high-quality-jogger.webp": {
  "w": 0.4922,
  "h": 0.8242,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 0.8003
 },
 "high-quality-merch-hoodie-1.webp": {
  "w": 0.9336,
  "h": 0.7773,
  "cx": 0.5059,
  "cy": 0.502,
  "ar": 0.7495
 },
 "high-quality-merch-hoodie.webp": {
  "w": 0.9453,
  "h": 0.7773,
  "cx": 0.5117,
  "cy": 0.5059,
  "ar": 0.75
 },
 "high-quality-open-leg-2.webp": {
  "w": 0.4805,
  "h": 0.9336,
  "cx": 0.502,
  "cy": 0.502,
  "ar": 1
 },
 "high-quality-open-leg.webp": {
  "w": 0.4688,
  "h": 0.9258,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "high-quality-relaxed-black.webp": {
  "w": 0.9609,
  "h": 0.9609,
  "cx": 0.4961,
  "cy": 0.5039,
  "ar": 1
 },
 "high-quality-relaxed.webp": {
  "w": 0.9766,
  "h": 0.9414,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 1
 },
 "high-quality-zip-1.webp": {
  "w": 0.8828,
  "h": 0.7852,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 0.8003
 },
 "high-quality-zip.webp": {
  "w": 0.875,
  "h": 0.8125,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 0.8003
 },
 "insulated-water-bottle-black.webp": {
  "w": 0.2813,
  "h": 0.9453,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "insulated-water-bottle-white.webp": {
  "w": 0.2813,
  "h": 0.9453,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "jogger-sweatpant-back-black.webp": {
  "w": 0.4922,
  "h": 0.8398,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 0.8003
 },
 "jogger-sweatpant-back-white.webp": {
  "w": 0.5078,
  "h": 0.8281,
  "cx": 0.4961,
  "cy": 0.5,
  "ar": 0.7998
 },
 "keycap-black.webp": {
  "w": 0.7109,
  "h": 0.6836,
  "cx": 0.5391,
  "cy": 0.5254,
  "ar": 1
 },
 "keycap-white.webp": {
  "w": 0.6289,
  "h": 0.625,
  "cx": 0.502,
  "cy": 0.4961,
  "ar": 1
 },
 "lanyard-black.webp": {
  "w": 0.2617,
  "h": 0.9648,
  "cx": 0.498,
  "cy": 0.502,
  "ar": 1
 },
 "lanyard-white.webp": {
  "w": 0.3594,
  "h": 0.9727,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 1
 },
 "long-sleeve-tee-back-black.webp": {
  "w": 0.8359,
  "h": 0.8672,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "long-sleeve-tee-back-white.webp": {
  "w": 0.8281,
  "h": 0.8594,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "luggage-tag-black.webp": {
  "w": 0.4805,
  "h": 0.9063,
  "cx": 0.541,
  "cy": 0.5,
  "ar": 1
 },
 "luggage-tag-white.webp": {
  "w": 0.4141,
  "h": 0.9102,
  "cx": 0.5156,
  "cy": 0.502,
  "ar": 1
 },
 "merch-hoodie-back-black.webp": {
  "w": 0.8984,
  "h": 0.8164,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 0.8003
 },
 "merch-hoodie-back-white.webp": {
  "w": 0.8594,
  "h": 0.7578,
  "cx": 0.5,
  "cy": 0.5156,
  "ar": 0.7998
 },
 "mousepad-black.webp": {
  "w": 0.8516,
  "h": 0.707,
  "cx": 0.5039,
  "cy": 0.498,
  "ar": 1
 },
 "mousepad-white.webp": {
  "w": 0.8438,
  "h": 0.7227,
  "cx": 0.5039,
  "cy": 0.502,
  "ar": 1
 },
 "open-leg-sweatpant-back-black.webp": {
  "w": 0.4297,
  "h": 0.9063,
  "cx": 0.5,
  "cy": 0.5039,
  "ar": 1
 },
 "open-leg-sweatpant-back-white.webp": {
  "w": 0.4922,
  "h": 0.9375,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "oversized-crop-hoodie-back-black.webp": {
  "w": 0.8633,
  "h": 0.7852,
  "cx": 0.498,
  "cy": 0.5137,
  "ar": 1
 },
 "oversized-crop-hoodie-back-white.webp": {
  "w": 0.8359,
  "h": 0.7305,
  "cx": 0.5,
  "cy": 0.4941,
  "ar": 0.7998
 },
 "oversized-crop-hoodie-black.webp": {
  "w": 0.8867,
  "h": 0.7461,
  "cx": 0.498,
  "cy": 0.502,
  "ar": 1
 },
 "oversized-crop-hoodie-white.webp": {
  "w": 0.8438,
  "h": 0.7578,
  "cx": 0.5,
  "cy": 0.5156,
  "ar": 1
 },
 "oversized-hoodie-back-black.webp": {
  "w": 0.875,
  "h": 0.8477,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "oversized-hoodie-back-white.webp": {
  "w": 0.875,
  "h": 0.8594,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "oversized-hoodie-black-v2.webp": {
  "w": 0.9766,
  "h": 0.8672,
  "cx": 0.5,
  "cy": 0.4883,
  "ar": 1
 },
 "oversized-hoodie-white-v2.webp": {
  "w": 0.9766,
  "h": 0.875,
  "cx": 0.5,
  "cy": 0.4883,
  "ar": 1
 },
 "pfd-heavy-open-leg-sweatpant.webp": {
  "w": 0.5234,
  "h": 0.9219,
  "cx": 0.5,
  "cy": 0.5039,
  "ar": 1
 },
 "premium-crewneck-back-black.webp": {
  "w": 0.8945,
  "h": 0.832,
  "cx": 0.498,
  "cy": 0.4941,
  "ar": 1
 },
 "premium-crewneck-back-white.webp": {
  "w": 0.8906,
  "h": 0.8242,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 1
 },
 "premium-hoodie-back-black.webp": {
  "w": 0.8516,
  "h": 0.9023,
  "cx": 0.5,
  "cy": 0.5098,
  "ar": 1
 },
 "premium-hoodie-back-white.webp": {
  "w": 0.8633,
  "h": 0.9258,
  "cx": 0.498,
  "cy": 0.502,
  "ar": 1
 },
 "premium-hoodie-black.webp": {
  "w": 0.9141,
  "h": 0.8242,
  "cx": 0.5,
  "cy": 0.5215,
  "ar": 0.7998
 },
 "premium-hoodie-white.webp": {
  "w": 0.8711,
  "h": 0.7969,
  "cx": 0.498,
  "cy": 0.5313,
  "ar": 0.7998
 },
 "premium-sweatpant-back-black.webp": {
  "w": 0.4102,
  "h": 0.832,
  "cx": 0.498,
  "cy": 0.5059,
  "ar": 1
 },
 "premium-sweatpant-back-white.webp": {
  "w": 0.4336,
  "h": 0.8594,
  "cx": 0.502,
  "cy": 0.5,
  "ar": 1
 },
 "premium-sweatpant-jet-black.webp": {
  "w": 0.4844,
  "h": 0.8086,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 0.7998
 },
 "premium-sweatpant-pfd.webp": {
  "w": 0.4766,
  "h": 0.8047,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 0.7998
 },
 "premium-zip-hoodie-back-black.webp": {
  "w": 0.8125,
  "h": 0.832,
  "cx": 0.5,
  "cy": 0.5137,
  "ar": 1
 },
 "premium-zip-hoodie-back-white.webp": {
  "w": 0.7656,
  "h": 0.832,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "quarter-zip-back-black.webp": {
  "w": 0.8516,
  "h": 0.8281,
  "cx": 0.5,
  "cy": 0.5078,
  "ar": 1
 },
 "quarter-zip-back-white.webp": {
  "w": 0.832,
  "h": 0.8477,
  "cx": 0.498,
  "cy": 0.5098,
  "ar": 1
 },
 "quarter-zip-black-v2.webp": {
  "w": 0.8867,
  "h": 0.9102,
  "cx": 0.502,
  "cy": 0.5137,
  "ar": 1
 },
 "quarter-zip-white-v2.webp": {
  "w": 0.9063,
  "h": 0.9258,
  "cx": 0.5,
  "cy": 0.5137,
  "ar": 1
 },
 "rael-black-long-sleeve-t-shirt.webp": {
  "w": 0.8672,
  "h": 0.9063,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "real-white-long-sleeve-t-shirt.webp": {
  "w": 0.8242,
  "h": 0.8516,
  "cx": 0.498,
  "cy": 0.4922,
  "ar": 1
 },
 "relaxed-tee-back-black.webp": {
  "w": 0.9844,
  "h": 0.9492,
  "cx": 0.5,
  "cy": 0.498,
  "ar": 1
 },
 "relaxed-tee-back-white.webp": {
  "w": 0.9766,
  "h": 0.9414,
  "cx": 0.5039,
  "cy": 0.498,
  "ar": 1
 },
 "ribbed-beanie-back-black.webp": {
  "w": 0.7539,
  "h": 0.8242,
  "cx": 0.502,
  "cy": 0.4902,
  "ar": 1
 },
 "ribbed-beanie-back-white.webp": {
  "w": 0.7656,
  "h": 0.8047,
  "cx": 0.5,
  "cy": 0.5,
  "ar": 1
 },
 "side-pocket-hoodie-back-black.webp": {
  "w": 0.9375,
  "h": 0.8477,
  "cx": 0.5,
  "cy": 0.5098,
  "ar": 1
 },
 "side-pocket-hoodie-back-white.webp": {
  "w": 0.9258,
  "h": 0.8477,
  "cx": 0.4941,
  "cy": 0.5098,
  "ar": 1
 },
 "side-pocket-hoodie-black.webp": {
  "w": 0.9453,
  "h": 0.8672,
  "cx": 0.5,
  "cy": 0.5234,
  "ar": 1
 },
 "side-pocket-hoodie-white.webp": {
  "w": 0.9258,
  "h": 0.8398,
  "cx": 0.498,
  "cy": 0.5098,
  "ar": 1
 },
 "six-panel-cap-back-black.webp": {
  "w": 0.7656,
  "h": 0.6563,
  "cx": 0.5,
  "cy": 0.4688,
  "ar": 1
 },
 "six-panel-cap-back-white.webp": {
  "w": 0.8125,
  "h": 0.6797,
  "cx": 0.5,
  "cy": 0.4609,
  "ar": 1
 },
 "sweat-short-back-black.webp": {
  "w": 0.6797,
  "h": 0.7383,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "sweat-short-back-white.webp": {
  "w": 0.7383,
  "h": 0.8516,
  "cx": 0.502,
  "cy": 0.4922,
  "ar": 1
 },
 "sweat-short-black-v2.webp": {
  "w": 0.7578,
  "h": 0.8008,
  "cx": 0.5039,
  "cy": 0.502,
  "ar": 1
 },
 "sweat-short-white-v2.webp": {
  "w": 0.8164,
  "h": 0.7656,
  "cx": 0.502,
  "cy": 0.4883,
  "ar": 1
 },
 "tote-bag-black.webp": {
  "w": 0.5781,
  "h": 0.9063,
  "cx": 0.543,
  "cy": 0.4922,
  "ar": 1
 },
 "tote-bag-white.webp": {
  "w": 0.5234,
  "h": 0.9141,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "tumbler-black.webp": {
  "w": 0.332,
  "h": 0.918,
  "cx": 0.4941,
  "cy": 0.5137,
  "ar": 1
 },
 "tumbler-white.webp": {
  "w": 0.3281,
  "h": 0.8164,
  "cx": 0.5,
  "cy": 0.502,
  "ar": 1
 },
 "vinyl-record-black.webp": {
  "w": 0.9023,
  "h": 0.9063,
  "cx": 0.5059,
  "cy": 0.5039,
  "ar": 1
 },
 "vinyl-record-white.webp": {
  "w": 0.875,
  "h": 0.8867,
  "cx": 0.5,
  "cy": 0.4902,
  "ar": 1
 },
 "windbreaker-back-black.webp": {
  "w": 0.7344,
  "h": 0.9063,
  "cx": 0.5,
  "cy": 0.4961,
  "ar": 1
 },
 "windbreaker-back-white.webp": {
  "w": 0.7266,
  "h": 0.9102,
  "cx": 0.4961,
  "cy": 0.4941,
  "ar": 1
 },
 "windbreaker-black.webp": {
  "w": 0.7344,
  "h": 0.9141,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "windbreaker-white.webp": {
  "w": 0.7344,
  "h": 0.9141,
  "cx": 0.5,
  "cy": 0.4922,
  "ar": 1
 },
 "zip-hoodie-back-black.webp": {
  "w": 0.875,
  "h": 0.75,
  "cx": 0.5,
  "cy": 0.5039,
  "ar": 0.75
 },
 "zip-hoodie-back-white.webp": {
  "w": 0.9492,
  "h": 0.8633,
  "cx": 0.498,
  "cy": 0.5098,
  "ar": 1
 },
 "zip-up-high-quality.webp": {
  "w": 0.8008,
  "h": 0.7383,
  "cx": 0.498,
  "cy": 0.502,
  "ar": 0.8003
 }
};
