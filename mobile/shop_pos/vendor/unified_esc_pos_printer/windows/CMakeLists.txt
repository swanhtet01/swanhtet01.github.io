cmake_minimum_required(VERSION 3.14)
set(PROJECT_NAME "unified_esc_pos_printer")
project(${PROJECT_NAME} LANGUAGES CXX)

set(PLUGIN_NAME "unified_esc_pos_printer_plugin")

add_library(${PLUGIN_NAME} SHARED
    "unified_esc_pos_printer_plugin.cpp"
    "ble_manager.cpp"
    "bt_classic_manager.cpp"
    "usb_print_manager.cpp"
)

apply_standard_settings(${PLUGIN_NAME})

target_compile_features(${PLUGIN_NAME} PRIVATE cxx_std_20)
target_compile_definitions(${PLUGIN_NAME} PRIVATE FLUTTER_PLUGIN_IMPL)

target_include_directories(${PLUGIN_NAME} INTERFACE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

target_link_libraries(${PLUGIN_NAME} PRIVATE
    flutter
    flutter_wrapper_plugin
    windowsapp
    comctl32
    winspool
)

set_target_properties(${PLUGIN_NAME} PROPERTIES
    CXX_VISIBILITY_PRESET hidden
)
