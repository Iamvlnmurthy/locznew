# R8 rules for the LocZ release build.
#
# Flutter's own plugin ships consumer rules for the engine, so this file covers only what
# the app adds on top. Each rule below exists because R8 cannot see the reference that
# keeps the class alive — every one of these is reached reflectively or from native code,
# which is exactly the case static analysis is blind to.

# Play Core is referenced by the Flutter engine's deferred-components support. The app does
# not use deferred components, so the classes are absent and R8 warns about the dangling
# references. Ignoring the warning is correct; keeping the classes is impossible.
-dontwarn com.google.android.play.core.**

# flutter_local_notifications reconstructs scheduled notifications from GSON after a reboot,
# so the model classes are instantiated purely by reflection.
-keep class com.dexterous.flutterlocalnotifications.** { *; }
-keep class * extends com.dexterous.flutterlocalnotifications.models.** { *; }

# GSON resolves generic types at runtime through the signature attribute; stripping it makes
# every parameterised deserialisation fail with a type error that points nowhere useful.
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Firebase Messaging dispatches to the receiver by name from the framework side.
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Keep source file and line numbers so a crash report from the field points at a real line,
# then rename the file itself so the mapping is still required to read it. Without this a
# release stack trace is a list of method names with no positions.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
