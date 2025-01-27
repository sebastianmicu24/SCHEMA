## Input Variables

### Classifier Path

This field asks for the path of a file ending in **.model** created using [Weka Trainable Segmentation Plugin](https://imagej.net/plugins/tws).  
You can download some prebuilt classifier models here: [LINK]()  
or you can read the section **Build your own classifier** of the documentation.

---

### Nuclei and White Thresholds

Both of these variables represent a minimum confidence threshold going from 0 to 255.

When the model assigns each pixel to be either nucleus, cytoplasm, or white background, it does so by assigning to each one a confidence value which represents how certain the model is about its decision.

For example, assigning a **Nuclei Threshold** of 255 will only select as nuclear pixels those pixels that the model is 100% certain about.

To understand what value works best for you, do a test run where you check the **Save Probability Maps** checkbox *(see later)*.


---
### Max Memory (tile size)
By default  [Weka Trainable Segmentation](https://imagej.net/plugins/tws)  struggles with big images because an increase in the total number of pixels leads to an increased RAM requirement. Because of this we implemented a tiling sistem that subdivides the image into tiles with a custom maximum size. 

For example choosing a maximum tile size of 1024 with an image that is 4000x3000 will split the image into the minimum number of equally sized tiles that do not surpass 1024 pixels in width and lenght. In this case 12 (4 x 3 tiles each with dimensions 1000x1000).

### Min and Max Vessel Size
To further help the segmentation we implemented a custom size limit for what is defined as vessel.  The **Min** variable is especially useful to filter out small white spots in the cytoplasm being wrongly assigned as vessels.
**BE CAREFUL**: if a pixel is not selected as being neither a nucleus, nor a vessel, will be assigned as being Cytoplasm.
The variable is scale dependant so be careful on how you measure it. 

### Min and Max Nucleus Size
These variables work just as the Min and Max Vessels Size, but for individual nuclei.  it is especialy useful to remove small darker stains that might be wrongly assigned as being nuclei.

### Scale Settings
The scale is set up as  **μm/px** so **be careful** at how your laboratory measures it. It might be measured  in px/μm and in that case you should convert it. Each microscope changes slightly, even with the same magnification, so the best approach would be to calibrate your scale on an object with a known size.  
If you cannot measure the true magnification of your microscope, a less precise approach can be using the following conversion table on a 10x digital zoom:   

<img src="https://github.com/sebastianmicu24/SCHEMA/blob/main/Images/Scale%20Example.png?raw=true" alt="Threshold example 1" width="534" height="186">

## Output Options

### Save Data Tables
The main objective of the SCHEMA macro, it is exported as a **csv file** separated by **commas** and with a **"." to define decimals**. 


Depending on the country your programs might not recognize this format *(for example the german standard uses semicolons as separators and commas for decimals)*. 

If you are having problems with opening the file we recommend doing the following:
1) Open the Data window
2) Click on Get Data
3) From File
4) From text/csv

The program will save a csv file for each image analyzed, this is to ensure progress isn't lost in case of computer crashes. 

### Save Coloured Previews
The image creates an example of the image to facilitate a rapid quality control for batches of images. 
1) The **nuclei** are coloured in **blue**
2) The **cytoplasm** is coloured in **pink**
3) The **vessels** are coloured in **red**
4) The **vessels** bordering the side of the image (or background) is coloured in **black**

### Save Probability Maps
Represent graphically how confident the model is in the classification of each pixel, the wither the pixel, the more confident the model is. It also allows the user to select proper values for the **Nuclei and White Threshold**

If you are not sure on how to set them up do the following:

1) Open the probability map in Imagej/Fiji
2) Threshold the image (*Image → Adjust → Threshold...* or *Ctrl+Shift+T*). 
3) Move the slider around until the image better reflects the sides of the Nuclei/Vessels

<img src="https://raw.githubusercontent.com/sebastianmicu24/SCHEMA/refs/heads/main/Images/Threshold%20Example%201.png" alt="Threshold example 1" width="400" height="400"></div>

<img src="https://raw.githubusercontent.com/sebastianmicu24/SCHEMA/refs/heads/main/Images/Threshold%20Example%202.png" alt="Threshold example 2" width="400" height="400"></div>

<img src="https://raw.githubusercontent.com/sebastianmicu24/SCHEMA/refs/heads/main/Images/Threshold%20Example%203.png" alt="Threshold example 3" width="400" height="400">

### Save ROI Files
Each image produces a .zip file containing all of the ROIs, to open them just drag and drop the **.zip** file into Imagej/Fiji. This is the more precise way to control the quality of the image and also allows further image analysis. 

## Classification 
The ImageJ SCHEMA macro only allows for the nuclear and vessel segmentation. To classify the cells into custom populations you need to download the **SCHEMA Classifier html file** you can find it [here](https://github.com/sebastianmicu24/SCHEMA/blob/main/SCHEMA_Classify.html):

## Custom Weka Models
If the pre-made models do not work for your data you can make your own by manually selecting the nuclei and vessels. If you have never used it [here](https://imagej.net/plugins/tws/) you can find youseful informations.  

**Here is a brief guide**
1) Install the plugin if you do not have it
2) Open it by going to Plugins → Segmentation → Trainable Weka Segmentation
3) Create a third Class
4) Rename the 3 Classes to "Nuclei", "Cytoplasm", "Background"
5) Choose the settings that work best for you. They might change from image to image (especcialy depending on the μm/px scale). 
In case you don't know what parameters  to input here are some brief general reccomendations, but keep in mind that the result changes a lot based on your images.

	1. We advise checking only the following:
		1.   Gaussian Blur
		2. Membrane Projections
		3. Anisotropic Diffusion
		4. Gabor
		5. Entropy
		6. Sobel FIlter
		7. Difference of Gaussians
		8. Variance
		9. Median
		10. Bilateral
		11.  Structure
		12. Balance Classes

	2. Membrane Thickness, Membrane Patch Size  and Minimum Sigma should be pretty low if you deal with close nuclei (for example infiltrate), respectively 1, 5 and 1. 0.

	3. In regards to Random forest settings *(opened by clicking on the model's name near the "choose button")*  we advice for:
		1. numTrees = 100-200
		2. maxDepth = 12
		3. numDecimalPlaces = 0 
		4. numFeatures = 4-5
		5. numThreads = depends on your machine, you can check it in the task manager.
		 


## Useful Links:
- [Github Repo](https://github.com/sebastianmicu24/SCHEMA)
- [ImageJ Documentation](https://imagej.net/)
- [ImageSC Forum](https://forum.image.sc/)
