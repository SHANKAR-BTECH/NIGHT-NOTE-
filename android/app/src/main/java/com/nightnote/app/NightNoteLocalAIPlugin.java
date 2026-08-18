package com.nightnote.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "NightNoteLocalAI")
public class NightNoteLocalAIPlugin extends Plugin {
    private static final String TAG = "NightNoteLocalAI";
    private NightNoteInference inference = new NightNoteInference();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean isDownloading = new AtomicBoolean(false);
    private final AtomicBoolean cancelDownloadRequested = new AtomicBoolean(false);

    private String currentStatus = "MODEL_NOT_INSTALLED";
    private int currentProgress = 0;

    @Override
    public void load() {
        inference.init();
        updateInitialStatus();
    }

    private void updateInitialStatus() {
        if (inference.isModelLoaded()) {
            currentStatus = "MODEL_LOADED";
            return;
        }

        // We check for the specific Lite V2 model defined in our config
        // This ensures we don't accidentally report READY if only an old Q5 model is present
        File modelDir = new File(getContext().getFilesDir(), "models");
        File modelFile = new File(modelDir, "nightnote-lite-smollm2-135m-v2-q5_k_m.gguf");
        
        if (modelFile.exists()) {
            currentStatus = "MODEL_READY";
        } else {
            currentStatus = "MODEL_NOT_INSTALLED";
        }
    }

    private void setStatus(String status, String message) {
        currentStatus = status;
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("message", message);
        ret.put("progress", currentProgress);
        notifyListeners("modelStatusChanged", ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        updateInitialStatus();
        JSObject ret = new JSObject();
        ret.put("status", currentStatus);
        ret.put("progress", currentProgress);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String downloadUrl = call.getString("url");
        String targetPath = call.getString("path");
        String expectedSha256 = call.getString("sha256");

        if (downloadUrl == null || targetPath == null) {
            call.reject("URL and path are required");
            return;
        }

        if (isDownloading.get()) {
            call.reject("Download already in progress");
            return;
        }

        isDownloading.set(true);
        cancelDownloadRequested.set(false);
        setStatus("MODEL_DOWNLOADING", "Starting download...");
        call.resolve(); // Async start

        executor.execute(() -> {
            try {
                File targetFile = new File(targetPath);
                File partFile = new File(targetPath + ".part");
                
                targetFile.getParentFile().mkdirs();

                URL url = new URL(downloadUrl);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                
                // Support resume if part file exists
                long downloadedBytes = 0;
                if (partFile.exists()) {
                    downloadedBytes = partFile.length();
                    connection.setRequestProperty("Range", "bytes=" + downloadedBytes + "-");
                    Log.i(TAG, "Attempting to resume download from byte: " + downloadedBytes);
                }
                
                connection.connect();
                
                int responseCode = connection.getResponseCode();
                
                // Manual redirect handling if needed (Hugging Face -> CDN)
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == HttpURLConnection.HTTP_MOVED_TEMP || responseCode == 307 || responseCode == 308) {
                    String newUrl = connection.getHeaderField("Location");
                    Log.i(TAG, "Redirecting to: " + newUrl);
                    connection = (HttpURLConnection) new URL(newUrl).openConnection();
                    if (downloadedBytes > 0) {
                        connection.setRequestProperty("Range", "bytes=" + downloadedBytes + "-");
                    }
                    connection.connect();
                    responseCode = connection.getResponseCode();
                }

                if (responseCode != HttpURLConnection.HTTP_OK && responseCode != HttpURLConnection.HTTP_PARTIAL) {
                    throw new Exception("Server returned HTTP " + responseCode);
                }

                long totalSize = connection.getContentLength();
                if (responseCode == HttpURLConnection.HTTP_PARTIAL) {
                    totalSize += downloadedBytes;
                }

                try (InputStream input = connection.getInputStream();
                     OutputStream output = new FileOutputStream(partFile, responseCode == HttpURLConnection.HTTP_PARTIAL)) {
                    
                    byte[] buffer = new byte[1024 * 64];
                    int bytesRead;
                    long currentTotal = downloadedBytes;

                    while ((bytesRead = input.read(buffer)) != -1) {
                        if (cancelDownloadRequested.get()) {
                            break;
                        }
                        output.write(buffer, 0, bytesRead);
                        currentTotal += bytesRead;
                        
                        if (totalSize > 0) {
                            int progress = (int) (currentTotal * 100 / totalSize);
                            if (progress != currentProgress) {
                                currentProgress = progress;
                                JSObject p = new JSObject();
                                p.put("progress", progress);
                                notifyListeners("modelDownloadProgress", p);
                            }
                        }
                    }
                }

                if (cancelDownloadRequested.get()) {
                    setStatus("MODEL_NOT_INSTALLED", "Download cancelled");
                    return;
                }

                // Verify integrity
                setStatus("MODEL_VERIFYING", "Verifying SHA-256...");
                if (expectedSha256 != null && !verifySha256(partFile, expectedSha256)) {
                    partFile.delete();
                    setStatus("MODEL_ERROR", "SHA-256 verification failed");
                    return;
                }

                // Atomic rename
                if (targetFile.exists()) targetFile.delete();
                if (!partFile.renameTo(targetFile)) {
                    throw new Exception("Failed to rename temporary file");
                }

                currentProgress = 100;
                setStatus("MODEL_READY", "Model downloaded and verified");

            } catch (Exception e) {
                Log.e(TAG, "Download error: " + e.getMessage());
                setStatus("MODEL_ERROR", e.getMessage());
            } finally {
                isDownloading.set(false);
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelDownloadRequested.set(true);
        call.resolve();
    }

    @PluginMethod
    public void removeModel(PluginCall call) {
        String path = call.getString("path");
        if (path != null) {
            File f = new File(path);
            if (f.exists()) f.delete();
        }
        updateInitialStatus();
        call.resolve();
    }

    private boolean verifySha256(File file, String expectedSha256) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream is = new FileInputStream(file)) {
                byte[] buffer = new byte[1024 * 64];
                int read;
                while ((read = is.read(buffer)) > 0) {
                    digest.update(buffer, 0, read);
                }
            }
            byte[] hash = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString().equalsIgnoreCase(expectedSha256);
        } catch (Exception e) {
            Log.e(TAG, "SHA-256 calculation failed: " + e.getMessage());
            return false;
        }
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Model path is required");
            return;
        }

        executor.execute(() -> {
            File modelFile = new File(path);
            if (!modelFile.exists()) {
                call.reject("Model file not found at " + path);
                return;
            }

            setStatus("MODEL_LOADING", "Loading into memory...");
            boolean success = inference.loadModel(path);
            if (success) {
                setStatus("MODEL_LOADED", "Ready for inference");
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } else {
                setStatus("MODEL_ERROR", "Failed to load model into memory");
                call.reject("Failed to load model from " + path);
            }
        });
    }

    @PluginMethod
    public void isModelLoaded(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("loaded", inference.isModelLoaded());
        call.resolve(ret);
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt");
        if (prompt == null) {
            call.reject("Prompt is required");
            return;
        }

        executor.execute(() -> {
            try {
                long start = System.currentTimeMillis();
                String result = inference.generate(prompt);
                long end = System.currentTimeMillis();
                Log.i(TAG, "NN_LATENCY java_bridge_ms=" + (end - start));
                
                JSObject ret = new JSObject();
                ret.put("result", result);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Generation error: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void releaseModel(PluginCall call) {
        executor.execute(() -> {
            inference.releaseModel();
            updateInitialStatus();
            call.resolve();
        });
    }
}
