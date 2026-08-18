#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <mutex>
#include <algorithm>
#include <cctype>
#include "llama.h"
#include "common.h"
#include "sampling.h"

#define LOG_TAG "NightNoteInference"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static llama_model* g_model = nullptr;
static llama_context* g_context = nullptr;
static std::vector<llama_token> g_cached_tokens;
static std::mutex g_mutex;

void llama_log_callback(ggml_log_level level, const char * text, void * user_data) {
    (void) level;
    (void) user_data;
    __android_log_print(ANDROID_LOG_INFO, "llama.cpp", "%s", text);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nightnote_app_NightNoteInference_init(JNIEnv* env, jobject thiz) {
    std::lock_guard<std::mutex> lock(g_mutex);
    llama_log_set(llama_log_callback, nullptr);
    llama_backend_init();
    LOGI("llama_backend_init completed");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nightnote_app_NightNoteInference_loadModel(JNIEnv* env, jobject thiz, jstring jmodel_path) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_model && g_context) {
        LOGI("NN_LATENCY model_already_loaded=true");
        return JNI_TRUE;
    }

    long start_load = ggml_time_ms();
    const char* model_path = env->GetStringUTFChars(jmodel_path, 0);
    LOGI("Loading model from %s", model_path);

    llama_model_params model_params = llama_model_default_params();
    g_model = llama_model_load_from_file(model_path, model_params);

    env->ReleaseStringUTFChars(jmodel_path, model_path);

    if (!g_model) {
        LOGE("Failed to load model from file");
        return JNI_FALSE;
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = 512;
    ctx_params.n_threads = 4;
    ctx_params.n_threads_batch = 4;
    ctx_params.n_batch = 256;
    ctx_params.n_ubatch = 256;

    g_context = llama_init_from_model(g_model, ctx_params);
    if (!g_context) {
        LOGE("Failed to initialize llama context");
        llama_model_free(g_model);
        g_model = nullptr;
        return JNI_FALSE;
    }

    g_cached_tokens.clear();
    long load_time = ggml_time_ms() - start_load;
    LOGI("NN_LATENCY model_load_ms=%ld", load_time);
    LOGI("Model and context initialized: n_ctx=512, n_threads=4, n_batch=256");
    return JNI_TRUE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nightnote_app_NightNoteInference_isModelLoaded(JNIEnv* env, jobject thiz) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return (g_model != nullptr && g_context != nullptr) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_nightnote_app_NightNoteInference_releaseModel(JNIEnv* env, jobject thiz) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_context) {
        llama_free(g_context);
        g_context = nullptr;
    }
    if (g_model) {
        llama_model_free(g_model);
        g_model = nullptr;
    }
    g_cached_tokens.clear();
    LOGI("Model and context released");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nightnote_app_NightNoteInference_generate(JNIEnv* env, jobject thiz, jstring jprompt) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (!g_context || !g_model) {
        return env->NewStringUTF("{\"error\": \"Model not loaded\"}");
    }

    const char* prompt_str = env->GetStringUTFChars(jprompt, 0);
    std::string prompt(prompt_str);
    env->ReleaseStringUTFChars(jprompt, prompt_str);

    long start_call = ggml_time_ms();
    LOGI("NN_LATENCY request_start");
    LOGI("Generating for prompt: %s", prompt.c_str());

    long start_tokenize = ggml_time_ms();
    // Tokenize full prompt
    std::vector<llama_token> tokens = common_tokenize(g_context, prompt, true, true);
    long end_tokenize = ggml_time_ms();

    long start_setup = ggml_time_ms();
    // OPTIMIZATION: Prefix Caching
    size_t n_shared = 0;
    for (size_t i = 0; i < std::min(tokens.size(), g_cached_tokens.size()); ++i) {
        if (tokens[i] != g_cached_tokens[i]) break;
        n_shared++;
    }

    // Use memory API to find current sequence position
    llama_pos kv_pos = llama_memory_seq_pos_max(llama_get_memory(g_context), 0) + 1;
    if (kv_pos < 0) kv_pos = 0; // Empty memory

    if (kv_pos > (llama_pos)n_shared) {
        llama_memory_seq_rm(llama_get_memory(g_context), 0, (llama_pos)n_shared, -1);
        LOGI("KV cache trimmed from %ld to %zu (prefix match)", (long)kv_pos, n_shared);
    } else {
        LOGI("Reusing %zu tokens from KV cache", n_shared);
    }
    long end_setup = ggml_time_ms();

    long start_eval = ggml_time_ms();
    size_t n_eval = tokens.size() - n_shared;
    if (n_eval > 0) {
        llama_batch batch = llama_batch_init((int32_t)n_eval, 0, 1);
        for (size_t i = 0; i < n_eval; ++i) {
            common_batch_add(batch, tokens[n_shared + i], (llama_pos)(n_shared + i), {0}, i == n_eval - 1);
        }
        if (llama_decode(g_context, batch) != 0) {
            LOGE("llama_decode failed");
            llama_batch_free(batch);
            return env->NewStringUTF("{\"error\": \"decode failed\"}");
        }
        llama_batch_free(batch);
    }
    long end_eval = ggml_time_ms();

    g_cached_tokens = tokens;

    common_params_sampling sampling_params;
    sampling_params.temp = 0.0f;
    sampling_params.top_p = 1.0f;
    sampling_params.top_k = 0;

    auto sampler = common_sampler_init(g_model, sampling_params);

    // Adequate output token budget to ensure full completion of multi-task outputs without truncation
    int max_tokens = 384;
    int max_avail = 512 - (int)tokens.size() - 8;
    if (max_avail > 32 && max_tokens > max_avail) {
        max_tokens = max_avail;
    }

    int tokens_gen = 0;
    std::string response = "";

    long start_gen = ggml_time_ms();
    llama_batch batch = llama_batch_init(1, 0, 1);
    for (int i = 0; i < max_tokens; ++i) {
        const llama_token id = common_sampler_sample(sampler, g_context, -1);
        common_sampler_accept(sampler, id, true);

        if (llama_vocab_is_eog(llama_model_get_vocab(g_model), id)) {
            LOGI("EOG detected");
            break;
        }

        std::string piece = common_token_to_piece(g_context, id);

        // Explicit stop token check
        if (piece.find("<|im_end|>") != std::string::npos || piece.find("<|endoftext|>") != std::string::npos) {
            LOGI("Stop token string detected");
            break;
        }

        response += piece;
        tokens_gen++;

        // EARLY STOP: Detect closing of top-level JSON object
        if (piece.find('}') != std::string::npos && response.find('{') != std::string::npos) {
            size_t open_braces = 0;
            size_t close_braces = 0;
            for (char c : response) {
                if (c == '{') open_braces++;
                if (c == '}') close_braces++;
            }
            if (open_braces > 0 && open_braces == close_braces) {
                // Check if last non-whitespace char is '}'
                std::string trimmed = response;
                trimmed.erase(std::find_if(trimmed.rbegin(), trimmed.rend(), [](unsigned char ch) {
                    return !std::isspace(ch);
                }).base(), trimmed.end());
                if (!trimmed.empty() && trimmed.back() == '}') {
                    LOGI("JSON balanced, stopping early");
                    break;
                }
            }
        }

        common_batch_clear(batch);
        common_batch_add(batch, id, (llama_pos)(tokens.size() + i), {0}, true);
        if (llama_decode(g_context, batch) != 0) break;
    }

    common_sampler_free(sampler);
    llama_batch_free(batch);

    long end_gen = ggml_time_ms();

    double generation_time_s = (end_gen - start_gen) / 1000.0;
    double tps = tokens_gen / (generation_time_s > 0 ? generation_time_s : 1.0);

    LOGI("NN_LATENCY context_setup_ms=%ld", end_setup - start_setup);
    LOGI("NN_LATENCY tokenize_ms=%ld", end_tokenize - start_tokenize);
    LOGI("NN_LATENCY prompt_tokens=%zu", tokens.size());
    LOGI("NN_LATENCY prompt_eval_ms=%ld", end_eval - start_eval);
    LOGI("NN_LATENCY generated_tokens=%d", tokens_gen);
    LOGI("NN_LATENCY generation_ms=%ld", end_gen - start_gen);
    LOGI("NN_LATENCY tok_per_sec=%.2f", tps);
    LOGI("NN_LATENCY native_total_ms=%ld", end_gen - start_call);

    return env->NewStringUTF(response.c_str());
}
