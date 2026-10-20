/// ESC/POS control characters
const String esc = '\x1B';
const String gs = '\x1D';
const String fs = '\x1C';

/// Initialize printer
const String cInit = '$esc@';

/// Beeper [count] [duration]
const String cBeep = '${esc}B';

/// Full cut
const String cCutFull = '${gs}V0';

/// Partial cut
const String cCutPart = '${gs}V1';

/// Turn white/black reverse print mode on
const String cReverseOn = '${gs}B\x01';

/// Turn white/black reverse print mode off
const String cReverseOff = '${gs}B\x00';

/// Select character size [N]
const String cSizeGSn = '$gs!';

/// Select character size [N]
const String cSizeESCn = '$esc!';

/// Turns off underline mode
const String cUnderlineOff = '$esc-\x00';

/// Turns on underline mode (1-dot thick)
const String cUnderline1dot = '$esc-\x01';

/// Turns on underline mode (2-dots thick)
const String cUnderline2dots = '$esc-\x02';

/// Turn emphasized mode on
const String cBoldOn = '${esc}E\x01';

/// Turn emphasized mode off
const String cBoldOff = '${esc}E\x00';

/// Font A
const String cFontA = '${esc}M\x00';

/// Font B
const String cFontB = '${esc}M\x01';

/// Turn 90° clockwise rotation mode on
const String cTurn90On = '${esc}V\x01';

/// Turn 90° clockwise rotation mode off
const String cTurn90Off = '${esc}V\x00';

/// Select character code table [N]
const String cCodeTable = '${esc}t';

/// Select Kanji character mode
const String cKanjiOn = '$fs&';

/// Cancel Kanji character mode
const String cKanjiOff = '$fs.';

/// Left justification
const String cAlignLeft = '${esc}a0';

/// Centered
const String cAlignCenter = '${esc}a1';

/// Right justification
const String cAlignRight = '${esc}a2';

/// Set absolute print position [nL] [nH]
const String cPos = '$esc\$';

/// Carriage return (return print head to start of line without feeding)
const String cCr = '\x0D';

/// Print and feed n lines [N]
const String cFeedN = '${esc}d';

/// Print and reverse feed n lines [N]
const String cReverseFeedN = '${esc}e';

/// Print image — raster format
const String cRasterImg = '$gs(L';

/// Print image — raster format obsolete
const String cRasterImg2 = '${gs}v0';

/// Print image — column format
const String cBitImg = '$esc*';

/// Barcode - Select print position of HRI characters [N]
const String cBarcodeSelectPos = '${gs}H';

/// Barcode - Select font for HRI characters [N]
const String cBarcodeSelectFont = '${gs}f';

/// Set barcode height [N]
const String cBarcodeSetH = '${gs}h';

/// Set barcode width [N]
const String cBarcodeSetW = '${gs}w';

/// Print barcode
const String cBarcodePrint = '${gs}k';

/// Open cash drawer via pin 2
const String cCashDrawerPin2 = '${esc}p030';

/// Open cash drawer via pin 5
const String cCashDrawerPin5 = '${esc}p130';

/// QR code header
const String cQrHeader = '$gs(k';

/// QR code control header
const String cControlHeader = '$gs(K';

/// Default network port for ESC/POS TCP printers
const int kDefaultNetworkPort = 9100;

/// Maximum number of beeps per single ESC B command
const int kMaxBeepCount = 9;

/// Default BLE write payload size (bytes per chunk before MTU negotiation)
const int kDefaultMtuPayload = 512;

/// Greyscale - black/white threshold for image rasterization
const int kRasterThreshold = 127;

/// Default baud rate for USB serial ESC/POS printers
const int kDefaultBaudRate = 115200;

/// Milliseconds timeout per host when scanning network subnet
const int kScanSubnetTimeoutMs = 500;

/// Default chunk size for Bluetooth Classic writes (bytes)
const int kDefaultBtChunkSize = 512;

/// Default pause between Bluetooth Classic write chunks (milliseconds).
/// Paces the transfer so cheap printer modules, which forward data to the
/// print MCU over an internal UART without flow control, are not overflowed
/// by large jobs.
const int kDefaultBtChunkDelayMs = 5;

/// Conservative Bluetooth Classic (SPP) throughput for drain estimation (bytes/second)
const int kBtDrainBytesPerSecond = 8 * 1024;

/// Assumed size of the local OS/stack write buffer (bytes)
const int kDrainBufferBytes = 16 * 1024;

/// Upper bound on any single drain wait (milliseconds)
const int kMaxDrainWaitMs = 10000;

/// Drain delay after BLE write-without-response data (milliseconds)
const int kBleWwrDrainDelayMs = 500;

/// Default BLE write chunk size (bytes). `0` = negotiated MTU.
const int kDefaultBleChunkSize = 128;

/// Default BLE write throughput for pacing (bytes/second).
const int kDefaultBleBytesPerSecond = 6 * 1024;

/// Minimum pause between BLE write chunks (milliseconds).
const int kDefaultBleChunkDelayMs = 0;
