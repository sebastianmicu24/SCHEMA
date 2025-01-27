
# Input Variables

## Classifier Path

This field asks for the path of a file ending in **.model** created using [Weka Trainable Segmentation Plugin](https://imagej.net/plugins/tws).  
You can download some prebuilt classifier models here: [LINK]()  
or you can read the section **Build your own classifier** of the documentation.

---

## Nuclei and White Thresholds

Both of these variables represent a minimum confidence threshold going from 0 to 255.

When the model assigns each pixel to be either nucleus, cytoplasm, or white background, it does so by assigning to each one a confidence value which represents how certain the model is about its decision.

For example, assigning a **Nuclei Threshold** of 255 will only select as nuclear pixels those pixels that the model is 100% certain about.

To understand what value works best for you, do a test run where you check the **Save Probability Maps** checkbox *(see later)*. Then open those images and do a threshold in ImageJ (*Image → Adjust → Threshold...* or *Ctrl+Shift+T*). It will allow you to visualize the results of these variables.

<div style="display: flex; gap: 10px;">
  <img src="https://www.shutterstock.com/image-photo/calm-weather-on-sea-ocean-600nw-2212935531.jpg" alt="Placeholder Image" width="150" height="150">
  <img src="https://www.shutterstock.com/image-photo/calm-weather-on-sea-ocean-600nw-2212935531.jpg" alt="Placeholder Image" width="150" height="150">
</div>

---

## Useful Links:
- [ImageJ Documentation](https://imagej.net/)
- [ImageSC Forum](https://forum.image.sc/)
