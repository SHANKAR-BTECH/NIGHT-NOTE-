package com.nightnote.app;

public class NightNoteInference {
    static {
        System.loadLibrary("nightnote_inference");
    }

    public native void init();
    public native boolean loadModel(String modelPath);
    public native boolean isModelLoaded();
    public native void releaseModel();
    public native String generate(String prompt);
}
