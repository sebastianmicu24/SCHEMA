// ================= YOU CAN MODIFY THE DEFAULT VALUES HERE =================

var CONFIG = {
    "DEFAULT_THRESHOLDS": {
        "NUCLEI": 110,
        "WHITE": 150
    },
    "MEMORY": {
        "MAX_TILE_SIZE": 1024
    },
    "PATHS": {
        "CLASSIFIER": "C:/Users/sebas/Desktop/Microscopy/Utilities/Machine Learning Models/x2.model",
        "INPUT": "C:/Users/sebas/Desktop/test",
        "OUTPUT": "C:/Users/sebas/Desktop/test"
    },
    "FILTERS": {
        "VESSELS": {
            "MIN_SIZE": 100,
            "MAX_SIZE": 0,
        },
        "NUCLEI": {
            "MIN_SIZE": 3,
            "MAX_SIZE": 0, 
            "ROUNDNESS": 0.1
        },
        "SCALE": 1
    },
    "COLOUR_PALETTE": {
        "NUCLEI": "blue",
        "VESSELS": "red",             
        "BORDER_VESSEL": "black",
        "CYTOPLASM": "cyan"   ,    
        "CELLS": "magenta",            
        "CYTOPLASM_CELLS": "pink", 
        "BACKGROUND": new java.awt.Color(255, 255, 255),       // white
        "BORDER": new java.awt.Color(200, 200, 200),          // grey
    },
    "IGNORE_BORDER_VESSELS": true
};

// ================= DO NOT TOUCH THE CODE FROM HERE =================

// Import required Java classes
importClass(Packages.ij.IJ);
importClass(Packages.ij.ImagePlus);
importClass(Packages.ij.WindowManager);
importClass(Packages.java.io.File);
importClass(Packages.trainableSegmentation.WekaSegmentation);
importClass(Packages.ij.plugin.ImageCalculator);
importClass(Packages.ij.plugin.frame.RoiManager);
importClass(Packages.ij.gui.NonBlockingGenericDialog);
importClass(Packages.ij.gui.ShapeRoi);
importClass(Packages.ij.gui.Roi);
importClass(Packages.ij.io.FileSaver);
importClass(Packages.ij.measure.ResultsTable);
importClass(Packages.ij.measure.Measurements);
importClass(Packages.ij.process.ImageStatistics);
importClass(Packages.fiji.util.gui.GenericDialogPlus);



// Global flag to control execution
var shouldStop = false;

// Progress monitoring
var progressDialog = {
    dialog: null,
    textArea: null,
    startTime: null,
    fileStartTime: null,
    
    initialize: function() {
        if (!this.dialog) {
            this.dialog = new java.awt.Frame("SCHEMA");
            this.dialog.setSize(600, 400);
            
            // Create layout
            var panel = new java.awt.Panel(new java.awt.BorderLayout());
            
            // Add text area
            this.textArea = new java.awt.TextArea("", 0, 0, java.awt.TextArea.SCROLLBARS_VERTICAL_ONLY);
            this.textArea.setEditable(false);
            panel.add(this.textArea, java.awt.BorderLayout.CENTER);
            
            // Add stop button
            var buttonPanel = new java.awt.Panel();
            var stopButton = new java.awt.Button("Stop Analysis");
            stopButton.addActionListener(new java.awt.event.ActionListener({
                actionPerformed: function(e) {
                    shouldStop = true;
                    progressDialog.showStatus("\nStopping analysis...");
                }
            }));
            buttonPanel.add(stopButton);
            panel.add(buttonPanel, java.awt.BorderLayout.SOUTH);
            
            this.dialog.add(panel);
            
            // Add window closing listener
            this.dialog.addWindowListener(new java.awt.event.WindowAdapter({
                windowClosing: function(e) {
                    shouldStop = true;
                    progressDialog.close();
                }
            }));
            
            // Center on screen
            var screen = java.awt.Toolkit.getDefaultToolkit().getScreenSize();
            var x = (screen.width - 600) / 2;
            var y = (screen.height - 400) / 2;
            this.dialog.setLocation(x, y);
            
            // Show dialog
            this.dialog.setVisible(true);
            
            // Initialize start time
            this.startTime = new Date().getTime();
        }
    },

    formatTime: function(milliseconds) {
        var seconds = Math.floor(milliseconds / 1000);
        var hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        var minutes = Math.floor(seconds / 60);
        seconds %= 60;
        // Fix padStart issue by using custom padding
        function pad(num) {
            return (num < 10 ? '0' : '') + num;}
        
        return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    },

    showProgress: function(message, current, total) {
        if (!this.dialog) this.initialize();
        var percent = Math.round((current / total) * 100);
        var bar = this.getProgressBar(percent);
        
        var currentTime = new Date().getTime();
        var elapsed = this.formatTime(currentTime - this.startTime);
        var fileElapsed = this.formatTime(currentTime - this.fileStartTime);
        
        this.appendText(message + "\n" + bar + "\n");
        this.appendText("Time elapsed - Total: " + elapsed + " | Current file: " + fileElapsed + "\n");
    },
    
    showStatus: function(message) {
        if (!this.dialog) this.initialize();
        this.appendText(message + "\n");
    },
    
    startFileTimer: function() {
        this.fileStartTime = new Date().getTime();
    },
    
    appendText: function(text) {
        if (this.textArea) {
            this.textArea.append(text);
            // Scroll to bottom
            this.textArea.setCaretPosition(this.textArea.getText().length());
        }
    },
    
    getProgressBar: function(percent) {
        var barLength = 40;
        var filledLength = Math.round((percent * barLength) / 100);
        var bar = "";
        for (var i = 0; i < filledLength; i++) bar += "#";
        for (var i = filledLength; i < barLength; i++) bar += "-";
        return "[" + bar + "] " + percent + "%";
    },
    
    close: function() {
        if (this.dialog) {
            this.dialog.dispose();
            this.dialog = null;
            this.textArea = null;
        }
    }
};

// File handling functions
function isImageFile(file) {
    if (!file.isFile()) return false;
    var name = file.getName().toLowerCase();
    if (name.indexOf("results") !== -1) return false;
    return name.endsWith(".tif") || 
           name.endsWith(".tiff") || 
           name.endsWith(".jpg") || 
           name.endsWith(".jpeg") || 
           name.endsWith(".png") || 
           name.endsWith(".gif");
}

function getRelativePath(file, basePath) {
    var filePath = file.getAbsolutePath();
    return filePath.substring(basePath.length);
}

function createOutputDirectory(file, basePath) {
    var relativePath = getRelativePath(file.getParentFile(), basePath);
    var outputDir = new File(CONFIG.PATHS.OUTPUT + relativePath);
    if (!outputDir.exists()) {
        outputDir.mkdirs();
    }
    return outputDir;
}

function createFullCanvas(width, height) {
    var imp = IJ.createImage("Full Canvas", "8-bit black", width, height, 1);
    IJ.run(imp, "Invert", "");
    return imp;
}


function countImagesInDirectory(dir) {
    var count = 0;
    var files = dir.listFiles();
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.isDirectory() && file.getName().toLowerCase().indexOf("results") === -1) {
            count += countImagesInDirectory(file);
        } else if (isImageFile(file)) {
            count++;
        }
    }
    return count;
}

function getUserInput() {
var GenericDialogPlus = Packages.fiji.util.gui.GenericDialogPlus;
var ActionListener = Packages.java.awt.event.ActionListener;
var ChangeListener = Packages.javax.swing.event.ChangeListener;
var JLabel = Packages.javax.swing.JLabel;
var JPanel = Packages.javax.swing.JPanel;
var GridBagLayout = Packages.java.awt.GridBagLayout;
var GridBagConstraints = Packages.java.awt.GridBagConstraints;
var Insets = Packages.java.awt.Insets;
var BoxLayout = Packages.javax.swing.BoxLayout;
var BorderFactory = Packages.javax.swing.BorderFactory;
var EmptyBorder = Packages.javax.swing.border.EmptyBorder;
var LineBorder = Packages.javax.swing.border.LineBorder;
var Color = Packages.java.awt.Color;
var JSlider = Packages.javax.swing.JSlider;
var JCheckBox = Packages.javax.swing.JCheckBox;
var JTextField = Packages.javax.swing.JTextField;
var Dimension = Packages.java.awt.Dimension;
var Integer = Packages.java.lang.Integer;
var FlowLayout = Packages.java.awt.FlowLayout;
var BorderLayout = Packages.java.awt.BorderLayout;
var JButton = Packages.javax.swing.JButton;
var Box = Packages.javax.swing.Box;
var JFileChooser = Packages.javax.swing.JFileChooser;
var FileNameExtensionFilter = Packages.javax.swing.filechooser.FileNameExtensionFilter;
var JEditorPane = Packages.javax.swing.JEditorPane;
var HyperlinkListener = Packages.javax.swing.event.HyperlinkListener;
var JDialog = Packages.javax.swing.JDialog;
var JScrollPane = Packages.javax.swing.JScrollPane;
var SwingUtilities = Packages.javax.swing.SwingUtilities;
var HyperlinkEvent = Packages.javax.swing.event.HyperlinkEvent;

    function createRoundedBorder(color) {
        return BorderFactory.createCompoundBorder(
            new LineBorder(color, 1, true),
            new EmptyBorder(3, 10, 3, 10)
        );
    }

    function createSectionTitle(text) {
        var container = new JPanel(new BorderLayout());
        container.setBorder(new EmptyBorder(10, 0, 5, 0));
        container.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
        
        var titlePanel = new JPanel(new BorderLayout());
        titlePanel.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
        var title = new JLabel("<html><b><font size=+1>" + text + "</font></b></html>");
        title.setHorizontalAlignment(JLabel.LEFT);
        titlePanel.add(title, BorderLayout.WEST);
        container.add(titlePanel, BorderLayout.CENTER);
        return container;
    }

    function createSliderPanel(labelText, min, max, initial) {
        var panel = new JPanel(new GridBagLayout());
        var gbc = new GridBagConstraints();
        panel.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
        
        gbc.insets = new Insets(0, 0, 0, 15);
        gbc.anchor = GridBagConstraints.WEST;

        var label = new JLabel(labelText);
        label.setPreferredSize(new Dimension(150, 20));
        gbc.gridx = 0;
        panel.add(label, gbc);

        var slider = new JSlider(min, max, initial);
        var valueLabel = new JLabel(String(initial));
        slider.addChangeListener(new ChangeListener({
            stateChanged: function(e) { valueLabel.setText(String(slider.getValue())); }
        }));
        slider.setBorder(createRoundedBorder(CONFIG.COLOUR_PALETTE.BORDER));
        gbc.gridx = 1;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        panel.add(slider, gbc);

        valueLabel.setPreferredSize(new Dimension(50, 20));
        gbc.gridx = 2;
        panel.add(valueLabel, gbc);

        return { panel: panel, slider: slider };
    }

    function createPathRow(labelText, field) {
        var panel = new JPanel(new GridBagLayout());
        panel.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
        
        var gbc = new GridBagConstraints();
        gbc.insets = new Insets(0, 0, 0, 5);
        
        // Label configuration
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 0;
        gbc.fill = GridBagConstraints.NONE;
        gbc.anchor = GridBagConstraints.WEST;
        var label = new JLabel(labelText);
        label.setPreferredSize(new Dimension(120, 25));
        panel.add(label, gbc);
        
        // Text field configuration
        gbc.gridx = 1;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        field.setPreferredSize(new Dimension(400, 25));
        field.setMinimumSize(new Dimension(200, 25));
        panel.add(field, gbc);
        
        // Browse button configuration
        gbc.gridx = 2;
        gbc.weightx = 0;
        gbc.fill = GridBagConstraints.NONE;
        var browseButton = new JButton("Browse");
        browseButton.setBorder(createRoundedBorder(new Color(100, 150, 200)));
        browseButton.setBackground(new Color(220, 240, 255));
        browseButton.setForeground(new Color(0, 80, 150));
        browseButton.setPreferredSize(new Dimension(90, 25));
        
        browseButton.addActionListener(new ActionListener({
            actionPerformed: function(e) {
                var chooser = new JFileChooser();
                chooser.setDialogTitle("Select " + labelText.replace(":", ""));
                chooser.setFileSelectionMode(labelText.toLowerCase().indexOf("folder") !== -1 ? 1 : 0);
                if(chooser.showOpenDialog(gd) === 0) {
                    field.setText(chooser.getSelectedFile().getAbsolutePath());
                }
            }
        }));
        
        panel.add(browseButton, gbc);
        return panel;
    }

    function createCheckbox(text, state) {
        var cb = new JCheckBox(text, state);
        cb.setBorder(createRoundedBorder(CONFIG.COLOUR_PALETTE.BORDER));
        cb.setOpaque(true);
        cb.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
        return cb;
    }

    // Main dialog construction
    var gd = new GenericDialogPlus("Advanced Analysis Settings");
    var mainPanel = new JPanel();
    mainPanel.setLayout(new BoxLayout(mainPanel, BoxLayout.Y_AXIS));
    mainPanel.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
    mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

    mainPanel.add(createSectionTitle("Path Settings"));
    var inputFolderField = new JTextField(30); 
    inputFolderField.setBorder(createRoundedBorder(CONFIG.COLOUR_PALETTE.BORDER));
    inputFolderField.setText(CONFIG.PATHS.INPUT);
    mainPanel.add(createPathRow("Input Folder:   ", inputFolderField));
    
    var outputFolderField = new JTextField(30); 
    outputFolderField.setBorder(createRoundedBorder(CONFIG.COLOUR_PALETTE.BORDER));
    outputFolderField.setText(CONFIG.PATHS.OUTPUT);
    mainPanel.add(createPathRow("Output Folder:", outputFolderField));
    
    var classifierField = new JTextField(30); 
    classifierField.setBorder(createRoundedBorder(CONFIG.COLOUR_PALETTE.BORDER));
    classifierField.setText(CONFIG.PATHS.CLASSIFIER);
    mainPanel.add(createPathRow("Classifier Path:", classifierField));

    // Threshold Settings
    mainPanel.add(createSectionTitle("Threshold Settings"));
    var nucleiThreshold = createSliderPanel("Nuclei Threshold:", 0, 255, CONFIG.DEFAULT_THRESHOLDS.NUCLEI);
    mainPanel.add(nucleiThreshold.panel);
    var whiteThreshold = createSliderPanel("White Threshold:", 0, 255, CONFIG.DEFAULT_THRESHOLDS.WHITE);
    mainPanel.add(whiteThreshold.panel);
    var memorySlider = createSliderPanel("Max Memory (tile size):", 256, 4096, CONFIG.MEMORY.MAX_TILE_SIZE);
    mainPanel.add(memorySlider.panel);

    // Size Filters
    mainPanel.add(createSectionTitle("Size & Shape Filters"));
    var minVessel = createSliderPanel("<html>Min Vessel Size (&#956;m<sup>2</sup>):</html>", 0, 1000, CONFIG.FILTERS.VESSELS.MIN_SIZE);
    mainPanel.add(minVessel.panel);
    var maxVessel = createSliderPanel("<html>Max Vessel Size (&#956;m<sup>2</sup>):</html>", 0, 10000, parseInt(CONFIG.FILTERS.VESSELS.MAX_SIZE) || 10000);
    mainPanel.add(maxVessel.panel);
    var minNucleus = createSliderPanel("<html>Min Nucleus Size (&#956;m<sup>2</sup>):</html>", 0, 20, CONFIG.FILTERS.NUCLEI.MIN_SIZE);
    mainPanel.add(minNucleus.panel);
var maxNucleus = createSliderPanel("<html>Max Nucleus Size (&#956;m<sup>2</sup>):</html>", 0, 200, parseInt(CONFIG.FILTERS.NUCLEI.MAX_SIZE) || 200);
mainPanel.add(maxNucleus.panel);

// Scale Settings Container
var scaleContainer = new JPanel();
scaleContainer.setLayout(new BoxLayout(scaleContainer, BoxLayout.Y_AXIS));
scaleContainer.add(createSectionTitle("Scale Settings"));

var scaleLabel = new JLabel("Scale (µm/pixel): 1.00");
var scaleSlider = new JSlider(0, 500, Math.round(CONFIG.FILTERS.SCALE * 100));
scaleSlider.setMajorTickSpacing(100);
scaleSlider.setMinorTickSpacing(25);
scaleSlider.setPaintTicks(true);
scaleSlider.setPaintLabels(true);

// Create custom labels for the scale slider
var labelTable = new java.util.Hashtable();
var labelValues = [0, 1, 2, 3, 4, 5]; // Values in µm/pixel
for (var i = 0; i < labelValues.length; i++) {
    labelTable.put(new Integer(labelValues[i] * 100), new JLabel(String(labelValues[i])));
}
scaleSlider.setLabelTable(labelTable);

scaleSlider.addChangeListener(function(e) {
    var scaledValue = scaleSlider.getValue() / 100;
    scaleLabel.setText("Scale (µm/pixel): " + new java.text.DecimalFormat("0.00").format(scaledValue));
});

scaleContainer.add(scaleLabel);
scaleContainer.add(scaleSlider);
scaleContainer.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
mainPanel.add(scaleContainer);

// Output Options Container
var outputContainer = new JPanel();
outputContainer.setLayout(new BoxLayout(outputContainer, BoxLayout.Y_AXIS));
outputContainer.add(createSectionTitle("Output Options"));


var checkboxes = [
    createCheckbox("Save Data Tables", true),
    createCheckbox("Save Coloured Previews", true),
    createCheckbox("Save Probability Maps", true),
    createCheckbox("Save ROI Files", true),
    createCheckbox("Ignore Border Vessels", false)
];

var checkBoxPanel = new JPanel();
checkBoxPanel.setLayout(new BoxLayout(checkBoxPanel, BoxLayout.Y_AXIS));
checkBoxPanel.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
checkboxes.forEach(function(cb) {
    cb.setAlignmentX(0);
    checkBoxPanel.add(cb);
    checkBoxPanel.add(Box.createRigidArea(new Dimension(0, 5)));
});

outputContainer.add(checkBoxPanel);
outputContainer.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
outputContainer.setBorder(new EmptyBorder(10, 0, 10, 0)); // Top, left, bottom, right margin
    
mainPanel.add(outputContainer);

    // Help System
    var helpButton = new JButton("Help");
    helpButton.setBorder(createRoundedBorder(new Color(100, 150, 200)));
    helpButton.setBackground(new Color(220, 240, 255));
    helpButton.setForeground(new Color(0, 80, 150));
    
    helpButton.addActionListener(new ActionListener({
        actionPerformed: function() {
            // Get parent window using SwingUtilities
            var parentWindow = SwingUtilities.getWindowAncestor(mainPanel);
            
            // Create help dialog
            var helpDialog = new JDialog(parentWindow, "Advanced Help", true);
            helpDialog.setSize(600, 400);
            
            // Create editor pane with proper HTML content
            var editorPane = new JEditorPane();
            editorPane.setEditable(false);
            editorPane.setContentType("text/html");
            
            // Create HTML content as concatenated Java strings
            var htmlContent = [
                "<html>",
                    "<body style='padding: 10px;'>",
                        "<h1>Input Variables</h1>",
                        "<div style='padding-left:20px;'>" ,
                            "<h2 style='margin-bottom: 0px;'>Classifier Path</h2>" ,
                            "<p>This field asks for the path of a file ending in <b>.model</b> created using <a href='https://imagej.net/plugins/tws'>Weka Trainable Segmentation Plugin</a>.<br>You can download some prebuilt classifier models here: <a href=''></a><br>or you can read the section <b>Build your own classifier</b> of the documentation.</p>" ,
                            "<br>" ,
                            "<h2 style='margin-bottom: 0px;'>Nuclei and White Thresholds</h2>" ,
                            "<p>Both of these variables represent a minimum confidence threshold going from 0 to 255.</p>" ,
                            "<p>When the model assigns each pixel to be either nucleus, cytoplasm, or white background, it does so by assigning to each one a confidence value which represents how certain the model is about its decision.</p>" ,
                            "<p>For example, assigning a <b>Nuclei Threshold</b> of 255 will only select as nuclear pixels those pixels that the model is 100% certain about.</p>" ,
                            "<p>To understand what value works best for you, do a test run where you check the <b>Save Probability Maps</b> checkbox <i>(see later)</i>. Then open those images and do a threshold in ImageJ (<i>Image → Adjust → Threshold...</i> or <i>Ctrl,Shift,T</i>). It will allow you to visualize the results of these variables.</p>" ,
                                "<div>" ,
                                "<img style='margin: 10px; padding: 10px;' src='https://www.shutterstock.com/image-photo/calm-weather-on-sea-ocean-600nw-2212935531.jpg' alt='Placeholder Image' width='150' height='150'>" ,
                                "<img id='2' src='https://www.shutterstock.com/image-photo/calm-weather-on-sea-ocean-600nw-2212935531.jpg' alt='Placeholder Image' width='150' height='150'>" ,
                                "</div>" ,
                        "</div>",
                '',
                "</div>",
                "<h2>Useful Links:</h2>",
                "<ul>",
                "<li><a href='https://imagej.net/'>ImageJ Documentation</a></li>",
                "<li><a href='https://forum.image.sc/'>ImageSC Forum</a></li>",
                "</ul>",
                "</body></html>"
            ].join("");
    
            // Set text using Java String
            editorPane.setText(String(htmlContent));
    
            // Add hyperlink listener
            editorPane.addHyperlinkListener(new HyperlinkListener({
                hyperlinkUpdate: function(e) {
                    if (e.getEventType() === HyperlinkEvent.EventType.ACTIVATED) {
                        try {
                            var url = e.getURL().toString();
                            var uri = new java.net.URI(url);
                            java.awt.Desktop.getDesktop().browse(uri);
                        } catch (ex) {
                            Packages.ij.IJ.log("Error opening link: " + ex);
                        }
                    }
                }
            }));
    
            // Add components to dialog
            helpDialog.add(new JScrollPane(editorPane));
            helpDialog.setLocationRelativeTo(parentWindow);
            helpDialog.setVisible(true);
        }
    }));
    
    var buttonContainer = new JPanel(new BorderLayout());
    buttonContainer.setBorder(new EmptyBorder(10, 0, 10, 0)); // Top, left, bottom, right margin
    buttonContainer.setBackground(CONFIG.COLOUR_PALETTE.BACKGROUND);
    buttonContainer.add(helpButton, BorderLayout.WEST);

    // Keep original button styling without internal padding
    helpButton.setBorder(createRoundedBorder(new Color(100, 150, 200)));

    // Replace existing mainPanel.add(helpButton) with:
    mainPanel.add(buttonContainer);

// Create custom scrollbar UI using ECMAScript 5 syntax
var CustomScrollBarUI = Java.extend(javax.swing.plaf.basic.BasicScrollBarUI, {
    configureScrollBarColors: function() {
        this.thumbColor = new Color(180, 180, 180);
        this.trackColor = CONFIG.COLOUR_PALETTE.BACKGROUND;
        this.thumbDarkShadowColor = new Color(180, 180, 180);
        this.thumbHighlightColor = new Color(180, 180, 180);
        this.thumbLightShadowColor = new Color(180, 180, 180);
        this.trackHighlightColor = CONFIG.COLOUR_PALETTE.BACKGROUND;
    },
    createDecreaseButton: function(orientation) {
        var button = new javax.swing.JButton();
        button.setPreferredSize(new Dimension(0, 0));
        button.setMinimumSize(new Dimension(0, 0));
        button.setMaximumSize(new Dimension(0, 0));
        return button;
    },
    createIncreaseButton: function(orientation) {
        var button = new javax.swing.JButton();
        button.setPreferredSize(new Dimension(0, 0));
        button.setMinimumSize(new Dimension(0, 0));
        button.setMaximumSize(new Dimension(0, 0));
        return button;
    }
});

// Setup scrollpane with custom UI
var scrollPane = new JScrollPane(mainPanel);
var customUI = new CustomScrollBarUI();
scrollPane.getVerticalScrollBar().setUI(customUI);
scrollPane.setVerticalScrollBarPolicy(javax.swing.ScrollPaneConstants.VERTICAL_SCROLLBAR_ALWAYS);
scrollPane.setHorizontalScrollBarPolicy(javax.swing.ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED);
scrollPane.setPreferredSize(new Dimension(600, 600));
scrollPane.getVerticalScrollBar().setUnitIncrement(16);
scrollPane.getVerticalScrollBar().setBlockIncrement(64);

// Make mainPanel adapt to window size
mainPanel.setPreferredSize(new Dimension(580, mainPanel.getPreferredSize().height));
scrollPane.getVerticalScrollBar().setUnitIncrement(16);
scrollPane.getVerticalScrollBar().setBlockIncrement(64);
    gd.addComponent(scrollPane);
    gd.showDialog();

    if (gd.wasOKed()) {
        CONFIG.PATHS.INPUT = inputFolderField.getText();
        CONFIG.PATHS.OUTPUT = outputFolderField.getText();
        CONFIG.PATHS.CLASSIFIER = classifierField.getText();
        CONFIG.DEFAULT_THRESHOLDS.NUCLEI = nucleiThreshold.slider.getValue();
        CONFIG.DEFAULT_THRESHOLDS.WHITE = whiteThreshold.slider.getValue();
        CONFIG.MEMORY.MAX_TILE_SIZE = memorySlider.slider.getValue();
        CONFIG.FILTERS.VESSELS.MIN_SIZE = minVessel.slider.getValue();
        CONFIG.FILTERS.VESSELS.MAX_SIZE = maxVessel.slider.getValue().toString();
        CONFIG.FILTERS.NUCLEI.MIN_SIZE = minNucleus.slider.getValue();
        CONFIG.FILTERS.NUCLEI.MAX_SIZE = maxNucleus.slider.getValue().toString();
        CONFIG.FILTERS.SCALE = scaleSlider.getValue() / 100; // Convert slider value to actual scale
        CONFIG.OUTPUT_OPTIONS = {
            saveData: checkboxes[0].isSelected(),
            savePreviews: checkboxes[1].isSelected(),
            saveProbabilities: checkboxes[2].isSelected(),
            saveROIs: checkboxes[3].isSelected()
        };
        CONFIG.IGNORE_BORDER_VESSELS = checkboxes[4].isSelected();
        return true;
    }
    return false;
}

// Main processing functions
function processFile(file, basePath) {
    if (shouldStop) return false;
    
    try {
        progressDialog.startFileTimer();
        progressDialog.showStatus("Processing file: " + file.getName());
        
        var image = IJ.openImage(file.getAbsolutePath());
        if (!image) {
            progressDialog.showStatus("Failed to open image: " + file.getName());
            return false;
        }
        
        progressDialog.showStatus("Setting image scale...");
        image.removeScale();
        IJ.run(image, "Set Scale...", "distance=1 known="+CONFIG.FILTERS.SCALE+" unit=um global");
        
        if (shouldStop) return false;
        
        progressDialog.showStatus("Initializing WEKA segmentation...");
        var wekaInit = wekaInitialization(image);
        if (!wekaInit) return false;
        
        if (shouldStop) return false;
        
        progressDialog.showStatus("Performing WEKA analysis...");
        var wekaStack = wekaTileAnalysis(image, wekaInit);
        if (!wekaStack) return false;
        
        if (shouldStop) return false;
        
        progressDialog.showStatus("Processing tissue components...");
        var processedImages = processTissue(image, wekaStack);
        if (!processedImages) return false;
        
        if (shouldStop) return false;
        
        progressDialog.showStatus("Analyzing cellular components...");
        var cellularResults = cellularParts(processedImages.vessels, processedImages.nuclei, processedImages.borderVessels, processedImages.allCytoplasmROI);
        if (!cellularResults) return false;
        
        if (shouldStop) return false;
        
        progressDialog.showStatus("Performing colour deconvolution...");
        if (ColourDeconvolution(image)) {
            progressDialog.showStatus("Saving results...");
            var outputDir = createOutputDirectory(file, basePath);
            saveAll(image, wekaStack, outputDir);
            
            var currentTime = new Date().getTime();
            var fileElapsed = progressDialog.formatTime(currentTime - progressDialog.fileStartTime);
            progressDialog.showStatus("Analysis completed for " + file.getName() + " in " + fileElapsed + "\n");
            return true;
        } else {
            IJ.error("Failed to perform colour deconvolution");
            return false;
        }
    } catch (e) {
        progressDialog.showStatus("Error processing " + file.getName() + ": " + e);
        return false;
    }
}

function processDirectory(dir, basePath) {
    if (shouldStop) return;
    
    var files = dir.listFiles();
    var imageCount = 0;
    var subdirs = [];
    
    // First count images recursively
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.isDirectory() && file.getName().toLowerCase().indexOf("results") === -1) {
            subdirs.push(file);
            imageCount += countImagesInDirectory(file);
        } else if (isImageFile(file)) {
            imageCount++;
        }
    }
    
    progressDialog.showStatus("Found " + imageCount + " images to process in " + dir.getName() + "\n");
    
    var processed = 0;
    // First process files in current directory
    for (var i = 0; i < files.length; i++) {
        if (shouldStop) break;
        
        var file = files[i];
        if (isImageFile(file)) {
            if (processFile(file, basePath)) {
                processed++;
                progressDialog.showProgress("Progress in " + dir.getName(), processed, imageCount);
            }
        }
    }
    
    // Then process subdirectories
    for (var i = 0; i < subdirs.length; i++) {
        if (shouldStop) break;
        processDirectory(subdirs[i], basePath);
    }
}


// Image processing functions
function wekaInitialization(image) {
    progressDialog.showStatus("Initializing Segmentation...");
    IJ.log("Initializing Segmentation");
    try {
        var xTiles = Math.ceil(image.getWidth() / CONFIG.MEMORY.MAX_TILE_SIZE);
        var yTiles = Math.ceil(image.getHeight() / CONFIG.MEMORY.MAX_TILE_SIZE);
        var zTiles = 0;
        
        var segmentator = new WekaSegmentation(image);
        if (!segmentator.loadClassifier(CONFIG.PATHS.CLASSIFIER)) {
            throw "Failed to load classifier";
        }

        return {
            segmentator: segmentator,
            xTiles: xTiles,
            yTiles: yTiles,
            zTiles: zTiles
        };
    } catch (e) {
        IJ.log("Error in Weka initialization: " + e);
        return null;
    }
}

function wekaTileAnalysis(image, wekaInit) {
    try {
        var tilesPerDim = [];
        if (image.getNSlices() > 1) {
            tilesPerDim = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 3);
            tilesPerDim[2] = wekaInit.zTiles;
        } else {
            tilesPerDim = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 2);
        }
        tilesPerDim[0] = wekaInit.xTiles;
        tilesPerDim[1] = wekaInit.yTiles;
    
        var result = wekaInit.segmentator.applyClassifier(image, tilesPerDim, 0, true);
        return result.getStack();
    } catch (e) {
        IJ.log("Error in Weka analysis: " + e);
        return null;
    }
}

// Binary processing functions
function thresholding(image, min, max) {
    try {
        var imp = image.duplicate();
        IJ.run(imp, "8-bit", "");
        IJ.setThreshold(imp, min, max);
        IJ.run(imp, "Convert to Mask", "");
    return imp;
} catch (e) {
        IJ.log("Error in thresholding: " + e);
        return null;
    }
}

// Unified binary processing with configurable operations
function processBinary(image, operations) {
    operations = operations || [];
    try {
        var imp = image.duplicate();
        IJ.run(imp, "8-bit", "");
        
        operations.forEach(function(op) {
            if (typeof IJ[op] === 'function' && imp.isProcessor()) {
                IJ.run(imp, op, "");
            }
        });
        
        return imp;
    } catch (e) {
        IJ.log("Error in binary processing: " + e);
        return null;
    }
}


// Configuration for nuclear processing steps
var NUCLEI_OPS = ["Dilate", "Close", "Fill Holes", "Watershed", "Erode"];
function particleAnalysis(image, min, max, exclude) {
    try {
        var imp = image.duplicate();
        // Convert pixel sizes to scaled units since Analyze Particles expects scaled units
        var scaledMin = min * CONFIG.FILTERS.SCALE * CONFIG.FILTERS.SCALE; // Convert px² to µm²
        var scaledMax = (max === "Infinity" || max === 0) ? "Infinity" : max * CONFIG.FILTERS.SCALE * CONFIG.FILTERS.SCALE;
        
        var command = exclude ? 
            "size=" + scaledMin + "-" + scaledMax + " show=Masks exclude add" :
            "size=" + scaledMin + "-" + scaledMax + " show=Masks add";
        
        IJ.run(imp, "Analyze Particles...", command);
        var maskTitle = "Mask of " + imp.getTitle();
        var mask = WindowManager.getImage(maskTitle);
        return mask;
    } catch (e) {
        IJ.log("Error in particle analysis: " + e);
        return null;
    }
}

// ROI handling functions
function binaryToROI(image, name, color, inverted) {
    try {
        var rm = RoiManager.getInstance();
        if (!rm) rm = new RoiManager();
        
        IJ.run(image, "8-bit", "");
        IJ.run(image, "Make Binary", "");
        IJ.run(image, "Create Selection", "");
        if (inverted) {
            IJ.run(image, "Make Inverse", "");
        }

        var roi = image.getRoi();
        if (roi) {
            rm.addRoi(roi);
            var roiIndex = rm.getCount() - 1;
            rm.select(roiIndex);
            rm.runCommand("Set Fill Color", color);
            rm.runCommand("Rename", name);
            return true;
        }
        return false;
    } catch (e) {
        IJ.log("Error creating ROI: " + e);
        return false;
    }
}

function analyzeAndRenameParticles(image, minSize, maxSize, prefix, color) {
    var rm = RoiManager.getInstance();
    var initialCount = rm.getCount();
    
    // Execute particle analysis with validation
    var command = "size=" + minSize/(CONFIG.FILTERS.SCALE*CONFIG.FILTERS.SCALE) + "-" + maxSize/(CONFIG.FILTERS.SCALE*CONFIG.FILTERS.SCALE) + " pixel show=Nothing add";
    if (!executeParticleAnalysis(image, command)) return [initialCount, initialCount];
    
    // Process results
    var finalCount = rm.getCount();
    updateRoiProperties(rm, initialCount, finalCount, prefix, color);
    
    return [initialCount, finalCount];
}

function executeParticleAnalysis(image, command) {
    try {
        IJ.run(image, "Analyze Particles...", command);
        return true;
    } catch (e) {
        logError("Particle analysis failed", e);
        return false;
    }
}

function updateRoiProperties(rm, startIdx, endIdx, prefix, color) {
    for (var i = startIdx; i < endIdx; i++) {
        rm.select(i);
        rm.runCommand("Set Fill Color", color);
        rm.runCommand("Rename", prefix + "_" + (i - startIdx + 1));
    }
}

function logError(context, error) {
    var message = context + ": " + error;
    IJ.log(message);
    progressDialog.showStatus(message);
}

// Tissue processing functions
/**
 * Unified tissue processing pipeline
 */
function processTissueComponent(stack, channelIndex, threshold, ops, titleSuffix) {
    try {
        var probMap = new ImagePlus("Probability Map", stack.getProcessor(channelIndex));
        var result = thresholding(probMap, threshold, 255);
        if (!result) return null;
        
        // Apply processing operations with proper image management
        ops.forEach(function(op) {
            if (!result) return; // Exit early if we lost the image
            
            try {
                if (typeof op === 'function') {
                    result = op(result);
                } else {
                    // Store reference to original image
                    var original = result;
                    IJ.run(original, op, "");
                    
                    // Get the new image if one was created
                    var newResult = WindowManager.getImage(original.getTitle() + " " + op)
                        || WindowManager.getImage(original.getTitle())
                        || IJ.getImage();
                    
                    // Handle case where operation failed to produce output
                    if (!newResult) {
                        IJ.log("Operation failed: " + op);
                        return null;
                    }
                    
                    // Update reference if we got a new image
                    if (newResult !== original) {
                        result = newResult;
                        original.close();
                    }
                }
                
                if (!result || !result.isProcessor()) {
                    IJ.log("Invalid result after operation: " + op);
                    return null;
                }
            } catch(e) {
                IJ.log("Error in operation " + op + ": " + e);
                return null;
            }
        });
        
        if (result) {
            result.setTitle(titleSuffix + " - " + probMap.getTitle());
        }
        return result;
    } catch (e) {
        logError("Tissue processing error", e);
        return null;
    }
}

function processTissue(image, stack) {
    try {
        // Process nuclei with standard pipeline
        var nuclei = processTissueComponent(
            stack, 
            1, 
            CONFIG.DEFAULT_THRESHOLDS.NUCLEI,
            [
                function(img) { return processBinary(img, NUCLEI_OPS); }
            ],
            "Nuclei Binary"
        );
        if (!nuclei) return null;

        // Process vessels with standard pipeline  
        var white = processTissueComponent(
            stack,
            3,
            CONFIG.DEFAULT_THRESHOLDS.WHITE,
            [
                function(img) { return processBinary(img, ["Fill Holes", "Watershed"]); }
            ],
            "Vessels Binary"
        );
        if (!white) return null;
        
        var vessels, borderVessels;
        vessels = particleAnalysis(white, CONFIG.FILTERS.VESSELS.MIN_SIZE, CONFIG.FILTERS.VESSELS.MAX_SIZE, true);
        if (!vessels) return null;
        vessels.setTitle("Vessels - " + image.getTitle());
        
        var vessels2 = particleAnalysis(white, CONFIG.FILTERS.VESSELS.MIN_SIZE, CONFIG.FILTERS.VESSELS.MAX_SIZE, false);
        var ic = new ImageCalculator();
        borderVessels = ic.run("Subtract create", vessels2, vessels);
        borderVessels.setTitle("Border - " + image.getTitle());
        vessels2.close();
        vessels.hide();
        

        // Process cytoplasm
        var fullCanvas = createFullCanvas(image.getWidth(), image.getHeight());
        var ic = new ImageCalculator();
        var cytoplasm = fullCanvas.duplicate();
        cytoplasm = ic.run("Subtract create", cytoplasm, vessels);
        cytoplasm = ic.run("Subtract create", cytoplasm, nuclei);
        cytoplasm = ic.run("Subtract create", cytoplasm, borderVessels);
        cytoplasm.setTitle("Cytoplasm binary - " + image.getTitle());

        // Extract ROIs
        var rm = RoiManager.getInstance() || new RoiManager();
        rm.reset();

        binaryToROI(nuclei, "All Nuclei", CONFIG.COLOUR_PALETTE.NUCLEI, false);
        binaryToROI(vessels, "Central Vessels", CONFIG.COLOUR_PALETTE.VESSELS, false);
        if (borderVessels) {
            binaryToROI(borderVessels, "Background / Border Vessels", CONFIG.COLOUR_PALETTE.BORDER, false);
        }
        
        // Get the cytoplasm ROI
        var allCytoplasmROI = null;
        IJ.run(cytoplasm, "8-bit", "");
        IJ.run(cytoplasm, "Make Binary", "");
        IJ.run(cytoplasm, "Create Selection", "");
        IJ.run(cytoplasm, "Make Inverse", "");
        allCytoplasmROI = cytoplasm.getRoi();
        if (allCytoplasmROI) {
            rm.addRoi(allCytoplasmROI);
            var roiIndex = rm.getCount() - 1;
            rm.select(roiIndex);
            rm.runCommand("Set Fill Color", CONFIG.COLOUR_PALETTE.CYTOPLASM);
            rm.runCommand("Rename", "All Cytoplasm");
        }
        
        return {
            vessels: vessels,
            nuclei: nuclei,
            borderVessels: borderVessels,
            allCytoplasmROI: allCytoplasmROI
        };
    } catch (e) {
        IJ.log("Error in Tissue Processing: " + e);
        return null;
    }
}

function createVoronoiCells(image, initial_count, final_count) {
    IJ.log("Creating Voronoi cells...");
    var rm = RoiManager.getInstance();
    
    var points_imp = IJ.createImage("Points", "8-bit black", image.getWidth(), image.getHeight(), 1);
    var ip = points_imp.getProcessor();
    ip.setColor(255);
    
    for (var i = initial_count; i < final_count; i++) {
        rm.select(i);
        var roi = rm.getRoi(i);
        var bounds = roi.getBounds();
        var x = bounds.x + bounds.width/2;
        var y = bounds.y + bounds.height/2;
        ip.drawDot(Math.round(x), Math.round(y));
    }
    
    points_imp.updateAndDraw();
    
    IJ.setAutoThreshold(points_imp, "Default dark");
    IJ.run(points_imp, "Convert to Mask", "");
    IJ.run(points_imp, "Voronoi", "");
    IJ.setRawThreshold(points_imp, 1, 255, null);
    IJ.run(points_imp, "Convert to Mask", "");
    
    points_imp.show();
    
    var cellsToKeep = [];
    var nucleiToDelete = [];
    var imageWidth = image.getWidth();
    var imageHeight = image.getHeight();
    
    for (var i = initial_count; i < final_count; i++) {
        rm.select(i);
        var nucleus_roi = rm.getRoi(i);
        var bounds = nucleus_roi.getBounds();
        var x = bounds.x + bounds.width/2;
        var y = bounds.y + bounds.height/2;
        
        IJ.doWand(Math.round(x), Math.round(y));
        var cell_roi = points_imp.getRoi();
        
        if (cell_roi) {
            var cellBounds = cell_roi.getBounds();
            if (cellBounds.x > 0 && 
                cellBounds.y > 0 && 
                (cellBounds.x + cellBounds.width) < imageWidth && 
                (cellBounds.y + cellBounds.height) < imageHeight) {
                
                rm.addRoi(cell_roi);
                rm.select(rm.getCount()-1);
                rm.runCommand("Set Fill Color", CONFIG.COLOUR_PALETTE.CELLS);
                rm.runCommand("Rename", "Cell_" + (i-initial_count+1));
                cellsToKeep.push(i-initial_count+1);
            } else {
                nucleiToDelete.push(i);
            }
        }
    }
    
    nucleiToDelete.sort(function(a, b) { return b - a; });
    for (var i = 0; i < nucleiToDelete.length; i++) {
        rm.select(nucleiToDelete[i]);
        rm.runCommand("Delete");
    }
    
    points_imp.changes = false;
    points_imp.hide();
    points_imp.close();
    
    return cellsToKeep;
}

function createCytoplasms(allCytoplasmROI) {
    IJ.log("Creating cytoplasms...");
    var rm = RoiManager.getInstance();
    if (!rm) {
        IJ.error("No ROI Manager open");
        return;
    }

    if (!allCytoplasmROI) {
        IJ.error("No cytoplasm ROI provided");
        return;
    }

    var nucleusIndices = {};
    var cellIndices = {};
    var maxNumber = 0;

    for (var i = 0; i < rm.getCount(); i++) {
        var name = rm.getName(i);
        if (name.startsWith("Nucleus_")) {
            var num = parseInt(name.split("_")[1]);
            nucleusIndices[num] = i;
            if (num > maxNumber) maxNumber = num;
        } else if (name.startsWith("Cell_")) {
            var num = parseInt(name.split("_")[1]);
            cellIndices[num] = i;
            if (num > maxNumber) maxNumber = num;
        }
    }

    var toDelete = {cytoplasms: [], cells: [], nuclei: []};

    for (var num = 1; num <= maxNumber; num++) {
        if (nucleusIndices[num] !== undefined && cellIndices[num] !== undefined) {
            rm.select(nucleusIndices[num]);
            var nucleus_roi = new ShapeRoi(rm.getRoi(nucleusIndices[num]));
            
            rm.select(cellIndices[num]);
            var cell_roi = new ShapeRoi(rm.getRoi(cellIndices[num]));
            
            var cytoplasm_roi = cell_roi.not(nucleus_roi);
            cytoplasm_roi = cytoplasm_roi.and(new ShapeRoi(allCytoplasmROI));

            rm.addRoi(cytoplasm_roi);
            rm.select(rm.getCount() - 1);
            rm.runCommand("Set Fill Color", CONFIG.COLOUR_PALETTE.CYTOPLASM_CELLS);
            rm.runCommand("Rename", "Cytoplasm_" + num);

            var stats = cytoplasm_roi.getStatistics();
            if (stats.area == 0) {
                toDelete.cytoplasms.push(num);
                toDelete.nuclei.push(nucleusIndices[num]);
            }
            toDelete.cells.push(cellIndices[num]);
        }
    }

    // Delete in reverse order to maintain indices
    for (var i = toDelete.cells.length - 1; i >= 0; i--) {
        rm.select(toDelete.cells[i]);
        rm.runCommand("Delete");
    }
    
    for (var i = toDelete.nuclei.length - 1; i >= 0; i--) {
        rm.select(toDelete.nuclei[i]);
        rm.runCommand("Delete");
    }
    
    for (var i = toDelete.cytoplasms.length - 1; i >= 0; i--) {
        for (var j = rm.getCount() - 1; j >= 0; j--) {
            if (rm.getName(j) === "Cytoplasm_" + toDelete.cytoplasms[i]) {
                rm.select(j);
                rm.runCommand("Delete");
                break;
            }
        }
    }
}

function cellularParts(vessels, nuclei, borderVessels, allCytoplasmROI) {
    try {
        var counts = {
            vessels: 0,
            border: 0,
            nuclei: 0
        };
        
            counts.vessels = analyzeAndRenameParticles(vessels, CONFIG.FILTERS.VESSELS.MIN_SIZE, CONFIG.FILTERS.VESSELS.MAX_SIZE, "Vessel", CONFIG.COLOUR_PALETTE.VESSELS)[1];
            
            IJ.run(borderVessels, "8-bit", "");
            IJ.run(borderVessels, "Fill Holes", "");
            counts.border = analyzeAndRenameParticles(borderVessels, CONFIG.FILTERS.VESSELS.MIN_SIZE, CONFIG.FILTERS.VESSELS.MAX_SIZE, "Border", CONFIG.COLOUR_PALETTE.BORDER)[1];
      
        
        var nucleiCounts = analyzeAndRenameParticles(nuclei, CONFIG.FILTERS.NUCLEI.MIN_SIZE, CONFIG.FILTERS.NUCLEI.MAX_SIZE, "Nucleus", CONFIG.COLOUR_PALETTE.NUCLEI);
        counts.nuclei = nucleiCounts[1] - nucleiCounts[0];
        
        createVoronoiCells(nuclei, nucleiCounts[0], nucleiCounts[1]);
        createCytoplasms(allCytoplasmROI);
        
        return counts;
    } catch (e) {
        IJ.log("Error in cellular analysis: " + e);
        return null;
    }
}

// Color deconvolution and saving functions
function ColourDeconvolution(imp) {
    if (!imp) {
        IJ.error("No image provided for colour deconvolution");
        return false;
    }
    
    try {
        IJ.run(imp, "Colour Deconvolution", "vectors=H&E hide");
        var title = imp.getTitle();
        return {
            success: true,
            hematoxylinImp: WindowManager.getImage(title + "-(Colour_1)"),
            eosinImp: WindowManager.getImage(title + "-(Colour_2)"),
            thirdImp: WindowManager.getImage(title + "-(Colour_3)")
        };
    } catch (e) {
        IJ.log("Error in colour deconvolution: " + e);
        return {success: false};
    }
}

function saveROI(outputDir) {
    var rm = RoiManager.getInstance();
    if (!rm || rm.getCount() == 0) return;
    
    var roiPath = new File(outputDir, "ROIs.zip");
    rm.runCommand("Save", roiPath.getAbsolutePath());
    IJ.log("ROIs saved to: " + roiPath.getAbsolutePath());
}
function saveColouredPreview(previewDir, baseName) {
    var rm = RoiManager.getInstance();
    if (!rm || rm.getCount() < 4) {
        IJ.log("Not enough ROIs to create preview");
        return;
    }

    // Get the first image to determine dimensions
    rm.select(0);
    var roi = rm.getRoi(0);
    var bounds = roi.getBounds();
    var width = bounds.x + bounds.width;
    var height = bounds.y + bounds.height;

    // Check all ROIs to ensure canvas is large enough
    for (var i = 1; i < rm.getCount(); i++) {
        rm.select(i);
        roi = rm.getRoi(i);
        bounds = roi.getBounds();
        width = Math.max(width, bounds.x + bounds.width);
        height = Math.max(height, bounds.y + bounds.height);
    }

    // Create a new RGB image
    var imp = IJ.createImage("Coloured Preview", "RGB", width, height, 1);
    imp.show();

    // Define colors for the first 4 ROIs
    var colors = [
        new java.awt.Color(0, 0, 139),  // dark blue
        java.awt.Color.RED,             // red
        java.awt.Color.BLACK,           // black
        new java.awt.Color(255, 192, 203) // pink
    ];

    // Draw the first 4 ROIs with specified colors
    var ip = imp.getProcessor();
    for (var i = 0; i < 4 && i < rm.getCount(); i++) {
        rm.select(i);
        roi = rm.getRoi(i);
        ip.setColor(colors[i]);
        ip.fill(roi);
    }

    imp.updateAndDraw();

    // Save the preview with title prefix
    var fs = new FileSaver(imp);
    fs.saveAsPng(new File(previewDir, baseName + "_preview.png").getAbsolutePath());
    
    // Close the preview window
    imp.close();
}

function saveData(resultsFile, imp, hematoxylinImp, eosinImp, thirdImp) {
    hematoxylinImp.hide();
    eosinImp.hide();
    thirdImp.close();

    var rm = RoiManager.getInstance();
    if (!rm || rm.getCount() == 0) {
        IJ.error("No ROIs in ROI Manager");
        return;
    }

    var rt = new ResultsTable();
    
    // Define measurement flags for each image type
    var originalMeasurements = Measurements.AREA | Measurements.MEAN | Measurements.STD_DEV |
        Measurements.MODE | Measurements.MIN_MAX | Measurements.CENTROID |
        Measurements.CENTER_OF_MASS | Measurements.RECT | Measurements.ELLIPSE |
        Measurements.MEDIAN | Measurements.SKEWNESS | Measurements.KURTOSIS;
        
    var hemaEosinMeasurements = Measurements.MEAN + Measurements.STD_DEV +
        Measurements.MODE + Measurements.MIN_MAX + Measurements.MEDIAN +
        Measurements.SKEWNESS + Measurements.KURTOSIS;

        var rois = rm.getRoisAsArray();

        // Collect vessel coordinates first
        var vesselData = [];
        for (var j = 0; j < rois.length; j++) {
            var vesselRoi = rois[j];
            var vesselName = rm.getName(j);
            if (vesselName.startsWith("Vessel_") || (!CONFIG.IGNORE_BORDER_VESSELS && vesselName.startsWith("Border_"))) {
                imp.setRoi(vesselRoi);
                var vesselStats = imp.getStatistics(Measurements.AREA | Measurements.CENTROID);
                var vesselArea = vesselStats.area;
                var vesselRadius = vesselArea > 0 ? Math.sqrt(vesselArea / Math.PI) : 0;
                vesselData.push({
                    name: vesselName,
                    x: vesselStats.xCentroid,
                    y: vesselStats.yCentroid,
                    radius: vesselRadius
                });
            }
        }

        for (var i = 0; i < rois.length; i++) {
            var roi = rois[i];
            var roiName = rm.getName(i);

            // Measure Original image with full set of measurements
            imp.setRoi(roi);
            var stats = imp.getStatistics(originalMeasurements);
            
            rt.incrementCounter();
            addValue(rt, "ROI", roiName);
            
            // Calculate minimum vessel distance for cellular ROIs
            var minDistance = "N/A";
            var closestVessel = "N/A";
            var adjustedDistance = "N/A";
            
            if (vesselData.length > 0 && (roiName.startsWith("Cell_") || roiName.startsWith("Cytoplasm_") || roiName.startsWith("Nucleus_"))) {
                var cellX = stats.xCentroid;
                var cellY = stats.yCentroid;
                var minDist = Infinity;
                var closest = null;
                
                for (var j = 0; j < vesselData.length; j++) {
                    var vessel = vesselData[j];
                    var dx = vessel.x - cellX;
                    var dy = vessel.y - cellY;
                    var currentCenterDist = Math.sqrt(dx*dx + dy*dy); // Already in µm due to global scale
                    var currentEdgeDist = currentCenterDist - vessel.radius; // Both values already in µm
                    
                    if (currentEdgeDist < minDist) {
                        minDist = currentEdgeDist;
                        closest = vessel;
                        var centerDist = currentCenterDist;
                        var edgeDist = currentEdgeDist;
                    }
                }
                
                if (closest) {
                    minDistance = centerDist.toFixed(2);
                    adjustedDistance = Math.max(0, edgeDist).toFixed(2); // Prevent negative distances
                    closestVessel = closest.name;
                }
            }
            
            addValue(rt, "Vessel Distance", minDistance);
            addValue(rt, "Closest Vessel", closestVessel);
            addValue(rt, "Adjusted Distance", adjustedDistance);

            // Original image measurements
            var perimeter = roi.getLength();
            var feretValues = roi.getFeretValues()


        // Calculate convex hull area for solidity
        var originalRoi = roi.clone();
        var convexHullPoly = originalRoi.getFloatConvexHull();
        var convexHullRoi = new Packages.ij.gui.PolygonRoi(
            convexHullPoly.xpoints,
            convexHullPoly.ypoints,
            convexHullPoly.npoints,
            Packages.ij.gui.Roi.POLYGON
        );
        
        imp.setRoi(originalRoi);
        var statsOriginal = imp.getStatistics(Packages.ij.measure.Measurements.AREA);
        var originalArea = statsOriginal.area;
        
        imp.setRoi(convexHullRoi);
        var statsConvexHull = imp.getStatistics(Packages.ij.measure.Measurements.AREA);
        var convexHullArea = statsConvexHull.area;
        
        
        addValue(rt, "Area", stats.area);
        addValue(rt, "X", stats.xCentroid);
        addValue(rt, "Y", stats.yCentroid);
        addValue(rt, "XM", stats.xCenterOfMass);
        addValue(rt, "YM", stats.yCenterOfMass);
        addValue(rt, "Perim.", perimeter);
        addValue(rt, "BX", stats.roiX);
        addValue(rt, "BY", stats.roiY);
        addValue(rt, "Width", stats.roiWidth);
        addValue(rt, "Height", stats.roiHeight);
        addValue(rt, "Major", stats.major);
        addValue(rt, "Minor", stats.minor);
        addValue(rt, "Angle", stats.angle);
        addValue(rt, "Circ.", (4 * Math.PI * stats.area) / (perimeter * perimeter));
        addValue(rt, "IntDen", stats.area * stats.mean);
        addValue(rt, "Feret", feretValues[0]);
        addValue(rt, "FeretX", feretValues[3]);
        addValue(rt, "FeretY", feretValues[4]);
        addValue(rt, "FeretAngle", feretValues[1]);
        addValue(rt, "MinFeret", feretValues[2]);
        addValue(rt, "AR", stats.major / stats.minor);  // Calculate aspect ratio manually      
        addValue(rt, "Round", (4 * stats.area) / (Math.PI * stats.major * stats.major));
        addValue(rt, "Solidity", originalArea / convexHullArea);
        addValue(rt, "Mean", stats.mean);
        addValue(rt, "StdDev", stats.stdDev);
        addValue(rt, "Mode", stats.mode);
        addValue(rt, "Min", stats.min);
        addValue(rt, "Max", stats.max);
        addValue(rt, "Median", stats.median);
        addValue(rt, "Skew", stats.skewness);
        addValue(rt, "Kurt", stats.kurtosis);

        // Hematoxylin measurements
        hematoxylinImp.setRoi(roi);
        var hemaStats = hematoxylinImp.getStatistics(hemaEosinMeasurements);
        addValue(rt, "Hema_Mean", hemaStats.mean);
        addValue(rt, "Hema_StdDev", hemaStats.stdDev);
        addValue(rt, "Hema_Mode", hemaStats.mode);
        addValue(rt, "Hema_Min", hemaStats.min);
        addValue(rt, "Hema_Max", hemaStats.max);
        addValue(rt, "Hema_Median", hemaStats.median);
        addValue(rt, "Hema_Skew", hemaStats.skewness);
        addValue(rt, "Hema_Kurt", hemaStats.kurtosis);

        // Eosin measurements
        eosinImp.setRoi(roi);
        var eosinStats = eosinImp.getStatistics(hemaEosinMeasurements);
        addValue(rt, "Eosin_Mean", eosinStats.mean);
        addValue(rt, "Eosin_StdDev", eosinStats.stdDev);
        addValue(rt, "Eosin_Mode", eosinStats.mode);
        addValue(rt, "Eosin_Min", eosinStats.min);
        addValue(rt, "Eosin_Max", eosinStats.max);
        addValue(rt, "Eosin_Median", eosinStats.median);
        addValue(rt, "Eosin_Skew", eosinStats.skewness);
        addValue(rt, "Eosin_Kurt", eosinStats.kurtosis);
    }

    rt.save(resultsFile.getAbsolutePath());
    IJ.log("Results saved to: " + resultsFile.getAbsolutePath());
}


function addValue(rt, column, value) {
    if (value === undefined || value === null || (typeof value === 'number' && isNaN(value))) {
        rt.addValue(column, "");
    } else {
        rt.addValue(column, value);
    }
}

function saveProbabilities(probabilitiesDir, stack, baseName) {
    if (!stack) {
        IJ.log("No probability stack provided");
        return;
    }

    try {
        // Define names for each probability map
        var names = ["Nuclei", "Cytoplasm", "Vessels-background"];
        
        // Save each probability map
        for (var i = 1; i <= 3; i++) {
            var probImp = new ImagePlus(names[i-1], stack.getProcessor(i));
            // Convert to 8-bit
            IJ.run(probImp, "8-bit", "");
            var fs = new FileSaver(probImp);
            var filename = baseName + "_" + names[i-1] + "_probabilities.tif";
            fs.saveAsTiff(new File(probabilitiesDir, filename).getAbsolutePath());
            IJ.log("Saved probability map " + names[i-1] + " to: " + filename);
            probImp.close();
        }
    } catch (e) {
        IJ.log("Error saving probability maps: " + e);
    }
}

function validatePaths() {
    // Check classifier file
    var classifierFile = new File(CONFIG.PATHS.CLASSIFIER);
    if (!classifierFile.exists()) {
        IJ.error("Classifier not found", "Classifier file not found at: " + CONFIG.PATHS.CLASSIFIER);
        return false;
    }
    
    // Check input folder
    var inputDir = new File(CONFIG.PATHS.INPUT);
    if (!inputDir.exists() || !inputDir.isDirectory()) {
        IJ.error("Invalid input", "Input directory not found: " + CONFIG.PATHS.INPUT);
        return false;
    }
    
    // Check output folder permissions
    try {
        var outputDir = new File(CONFIG.PATHS.OUTPUT);
        if (!outputDir.exists()) {
            if (!outputDir.mkdirs()) {
                IJ.error("Permission denied", "Cannot create output directory: " + CONFIG.PATHS.OUTPUT);
                return false;
            }
        } else {
            // Test write permission by creating/deleting temp file
            var testFile = new File(outputDir, ".test");
            if (!testFile.createNewFile()) {
                IJ.error("Permission denied", "Cannot write to output directory: " + CONFIG.PATHS.OUTPUT);
                return false;
            }
            testFile.delete();
        }
    } catch (e) {
        IJ.error("Error", "Error checking output directory: " + e.message);
        return false;
    }
    
    return true;
}

function saveAll(imp, wekaStack, outputDir) {
    if (!imp) {
        IJ.error("No image provided");
        return;
    }
    
    var title = imp.getTitle();
    // Get filename without extension
    var baseName = title.replace(/\.[^/.]+$/, "");
    
    // Create the four main directories
    var dataDir = new File(outputDir, "Data");
    var roiDir = new File(outputDir, "ROI");
    var previewDir = new File(outputDir, "Preview");
    var probabilitiesDir = new File(outputDir, "Probabilities");
    
    // Create directories if they don't exist
    dataDir.mkdirs();
    roiDir.mkdirs();
    previewDir.mkdirs();
    probabilitiesDir.mkdirs();
    
    // Save ROIs if enabled
    if (CONFIG.OUTPUT_OPTIONS.saveROIs) {
        var roiPath = new File(roiDir, baseName + "_ROI.zip");
        var rm = RoiManager.getInstance();
        if (rm && rm.getCount() > 0) {
            rm.runCommand("Save", roiPath.getAbsolutePath());
            IJ.log("ROIs saved to: " + roiPath.getAbsolutePath());
        }
    }
    
    // Save preview if enabled
    if (CONFIG.OUTPUT_OPTIONS.savePreviews) {
        saveColouredPreview(previewDir, baseName);
    }
    
    // Save data if enabled
    if (CONFIG.OUTPUT_OPTIONS.saveData) {
        var resultsFile = new File(dataDir, baseName + "_data.csv");
        var deconvResult = ColourDeconvolution(imp);
        if (deconvResult.success) {
            saveData(resultsFile, imp, deconvResult.hematoxylinImp, deconvResult.eosinImp, deconvResult.thirdImp);
        }
    }
    
    // Save probabilities if enabled
    if (CONFIG.OUTPUT_OPTIONS.saveProbabilities) {
        saveProbabilities(probabilitiesDir, wekaStack, baseName);
    }
}

function cleanup() {
    // Close any open images
    var ids = WindowManager.getIDList();
    if (ids != null) {
        for (var i = 0; i < ids.length; i++) {
            var imp = WindowManager.getImage(ids[i]);
            if (imp != null) {
                imp.changes = false;
                imp.close();
            }
        }
    }
    
    // Reset ROI Manager
    var rm = RoiManager.getInstance();
    if (rm != null) {
        rm.reset();
        rm.close();
    }
    
    // Clean up temporary files
    var tempFiles = ["Points", "Mask of Points"];
    for (var i = 0; i < tempFiles.length; i++) {
        var imp = WindowManager.getImage(tempFiles[i]);
        if (imp != null) {
            imp.changes = false;
            imp.close();
        }
    }
    
    // Close progress dialog
    progressDialog.close();
}

function mainLoop() {
    shouldStop = false;
    
    // Get user input before starting
    if (!getUserInput()) {
        return;
    }
    
    // Validate paths before starting
    if (!validatePaths()) {
        return;
    }
    
    progressDialog.initialize();
    
    try {
        var baseDir = new File(CONFIG.PATHS.INPUT);
        processDirectory(baseDir, CONFIG.PATHS.INPUT);
        
        var totalTime = progressDialog.formatTime(new Date().getTime() - progressDialog.startTime);
        if (shouldStop) {
            progressDialog.showStatus("\nAnalysis stopped by user after " + totalTime + "!");
        } else {
            progressDialog.showStatus("\nAnalysis completed for all images in " + totalTime + "!");
        }
    } catch (e) {
        IJ.log("Error in main loop: " + e);
        progressDialog.showStatus("\nError occurred: " + e);
    } finally {
        cleanup();
    }
    }


mainLoop();
