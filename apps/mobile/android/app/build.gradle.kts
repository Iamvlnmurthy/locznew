import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val signingProperties = Properties()
val signingPropertiesFile = rootProject.file("key.properties")
if (signingPropertiesFile.exists()) {
    signingPropertiesFile.inputStream().use(signingProperties::load)
}

fun releaseSigningValue(property: String, environment: String): String? =
    providers.environmentVariable(environment).orNull
        ?: signingProperties.getProperty(property)

val releaseStoreFile = releaseSigningValue("storeFile", "LOCZ_UPLOAD_STORE_FILE")
val releaseStorePassword = releaseSigningValue("storePassword", "LOCZ_UPLOAD_STORE_PASSWORD")
val releaseKeyAlias = releaseSigningValue("keyAlias", "LOCZ_UPLOAD_KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("keyPassword", "LOCZ_UPLOAD_KEY_PASSWORD")
val hasReleaseSigning =
    listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
        .all { !it.isNullOrBlank() }

android {
    namespace = "com.locz.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications uses java.time, which does not exist below API 26.
        // Desugaring backfills it so notification scheduling works on older phones —
        // a large share of the Indian install base.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.locz.app"
        // Desugaring requires multidex on the older API levels it exists to support.
        multiDexEnabled = true
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // A store artifact must never be signed with Flutter's shared debug key.
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }

            // R8 shrinks and obfuscates. Without it the bundle ships every unreachable
            // class from every dependency, and the Kotlin and Java layer keeps its original
            // names — which is a gift to anyone reading the app to find out how the API
            // works. The Dart code is already compiled to machine code by AOT; this covers
            // the Android half that is not.
            //
            // Resource shrinking needs code shrinking on, and removes the drawables and
            // strings that dependencies bring along and nothing references.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

val verifyReleaseSigning by tasks.registering {
    group = "verification"
    description = "Fails release packaging when the LocZ upload-key configuration is absent."
    doLast {
        if (!hasReleaseSigning) {
            throw GradleException(
                "Release signing is not configured. Copy key.properties.example to " +
                    "key.properties or set the four LOCZ_UPLOAD_* environment variables.",
            )
        }
        val configuredStore = rootProject.file(releaseStoreFile!!)
        if (!configuredStore.isFile) {
            throw GradleException("Release keystore does not exist: ${configuredStore.absolutePath}")
        }
    }
}

tasks.configureEach {
    if (name == "assembleRelease" || name == "bundleRelease" || name == "packageRelease") {
        dependsOn(verifyReleaseSigning)
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}

flutter {
    source = "../.."
}
