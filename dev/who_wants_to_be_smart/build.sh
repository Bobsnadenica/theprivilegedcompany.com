flutter clean
cd ios/
pod deintegrate
cd ..
flutter pub get
cd ios/
pod install
cd ..
flutter run --release
