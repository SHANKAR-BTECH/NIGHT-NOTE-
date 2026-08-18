cmake_minimum_required(VERSION 3.22.1)

project("nightnote_inference")

# 16 KB Page-size alignment support for Android 15+
add_link_options("-Wl,-z,max-page-size=16384" "-Wl,-z,common-page-size=16384")

# Global compiler optimization across all sub-libraries (llama, ggml-base, ggml-cpu, etc.)
add_compile_options(-O3 -fno-stack-protector)
set(CMAKE_C_FLAGS_DEBUG "-O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_DEBUG "-O3 -DNDEBUG")
set(CMAKE_C_FLAGS_RELEASE "-O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

set(LLAMA_DIR ${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp)

# llama.cpp build options
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "llama.cpp: build examples" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "llama.cpp: build tests" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "llama.cpp: build server" FORCE)

# Add llama.cpp as a subdirectory
add_subdirectory(${LLAMA_DIR} EXCLUDE_FROM_ALL)

# Common helper library from llama.cpp
file(GLOB COMMON_SOURCES "${LLAMA_DIR}/common/*.cpp")
file(GLOB COMMON_HEADERS "${LLAMA_DIR}/common/*.h")

add_library(llama_common STATIC ${COMMON_SOURCES} build-info.cpp)

target_include_directories(llama_common PUBLIC
    ${LLAMA_DIR}/common
    ${LLAMA_DIR}/include
    ${LLAMA_DIR}/vendor
    ${LLAMA_DIR}/vendor/cpp-httplib
    ${LLAMA_DIR}/vendor/nlohmann
)

target_link_libraries(llama_common PUBLIC llama ggml)

# JNI Library
add_library(nightnote_inference SHARED
    llama-jni.cpp
)

target_include_directories(nightnote_inference PRIVATE
    ${LLAMA_DIR}/include
    ${LLAMA_DIR}/common
    ${LLAMA_DIR}/ggml/include
    ${LLAMA_DIR}/vendor
)

target_link_libraries(nightnote_inference
    llama_common
    llama
    ggml
    log
    android
)
