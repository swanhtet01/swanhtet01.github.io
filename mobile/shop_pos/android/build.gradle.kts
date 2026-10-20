allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// unified_esc_pos_printer 3.4.0 still declares Android compile SDK 34, while
// its current transitive plugins (including network_info_plus) require 36.
// Raise only that library's compile SDK; the app's target SDK and runtime
// behavior remain controlled by Flutter's normal configuration.
subprojects {
    if (name == "unified_esc_pos_printer") {
        pluginManager.withPlugin("com.android.library") {
            afterEvaluate {
                val androidExtension = extensions.findByName("android")
                    ?: error("Android extension missing for unified_esc_pos_printer")
                val setCompileSdk = androidExtension.javaClass.methods.firstOrNull {
                    it.name == "setCompileSdk" && it.parameterCount == 1
                } ?: error("compileSdk setter missing for unified_esc_pos_printer")
                setCompileSdk.invoke(androidExtension, 36)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
