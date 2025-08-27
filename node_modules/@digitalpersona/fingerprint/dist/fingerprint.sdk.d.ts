declare namespace Fingerprint {
    function b64UrlTo64(a: string): string;
    function b64To64Url(a: string): string;
    function b64UrlToUtf8(str: string): string;
    function strToB64Url(str: string): string;
    enum DeviceUidType {
        Persistent = 0,
        Volatile = 1
    }
    enum DeviceModality {
        Unknown = 0,
        Swipe = 1,
        Area = 2,
        AreaMultifinger = 3
    }
    enum DeviceTechnology {
        Unknown = 0,
        Optical = 1,
        Capacitive = 2,
        Thermal = 3,
        Pressure = 4
    }
    enum SampleFormat {
        Raw = 1,
        Intermediate = 2,
        Compressed = 3,
        PngImage = 5
    }
    enum QualityCode {
        Good = 0,
        NoImage = 1,
        TooLight = 2,
        TooDark = 3,
        TooNoisy = 4,
        LowContrast = 5,
        NotEnoughFeatures = 6,
        NotCentered = 7,
        NotAFinger = 8,
        TooHigh = 9,
        TooLow = 10,
        TooLeft = 11,
        TooRight = 12,
        TooStrange = 13,
        TooFast = 14,
        TooSkewed = 15,
        TooShort = 16,
        TooSlow = 17,
        ReverseMotion = 18,
        PressureTooHard = 19,
        PressureTooLight = 20,
        WetFinger = 21,
        FakeFinger = 22,
        TooSmall = 23,
        RotatedTooMuch = 24
    }
    class Event {
        type: string;
        constructor(type: string);
    }
    class CommunicationEvent extends Event {
        constructor(type: string);
    }
    class CommunicationFailed extends CommunicationEvent {
        constructor();
    }
    class AcquisitionEvent extends Event {
        deviceUid: string;
        constructor(type: string, deviceUid: string);
    }
    class DeviceConnected extends AcquisitionEvent {
        constructor(deviceUid: string);
    }
    class DeviceDisconnected extends AcquisitionEvent {
        constructor(deviceUid: string);
    }
    class SamplesAcquired extends AcquisitionEvent {
        sampleFormat: SampleFormat;
        samples: string;
        constructor(deviceUid: string, sampleFormat: SampleFormat, samples: string);
    }
    class QualityReported extends AcquisitionEvent {
        quality: QualityCode;
        constructor(deviceUid: string, quality: QualityCode);
    }
    class ErrorOccurred extends AcquisitionEvent {
        error: number;
        constructor(deviceUid: string, error: number);
    }
    class AcquisitionStarted extends AcquisitionEvent {
        constructor(deviceUid: string);
    }
    class AcquisitionStopped extends AcquisitionEvent {
        constructor(deviceUid: string);
    }
    interface DeviceInfo {
        DeviceID: string;
        eUidType: DeviceUidType;
        eDeviceModality: DeviceModality;
        eDeviceTech: DeviceTechnology;
    }
    interface Handler<E> {
        (event: E): any;
    }
    interface MultiCastEventSource {
        on(event: string, handler: Handler<Event>): MultiCastEventSource;
        off(event?: string, handler?: Handler<Event>): MultiCastEventSource;
    }
    interface CommunicationEventSource {
        onCommunicationFailed?: Handler<CommunicationFailed>;
    }
    interface AcquisitionEventSource {
        onDeviceConnected?: Handler<DeviceConnected>;
        onDeviceDisconnected?: Handler<DeviceDisconnected>;
        onSamplesAcquired?: Handler<SamplesAcquired>;
        onQualityReported?: Handler<QualityReported>;
        onErrorOccurred?: Handler<ErrorOccurred>;
        onAcquisitionStarted?: Handler<AcquisitionStarted>;
        onAcquisitionStopped?: Handler<AcquisitionStopped>;
    }
    interface EventSource extends AcquisitionEventSource, CommunicationEventSource, MultiCastEventSource {
        on(event: string, handler: Handler<Event>): EventSource;
        on(event: "DeviceConnected", handler: Handler<DeviceConnected>): EventSource;
        on(event: "DeviceDisconnected", handler: Handler<DeviceDisconnected>): EventSource;
        on(event: "SamplesAcquired", handler: Handler<SamplesAcquired>): EventSource;
        on(event: "QualityReported", handler: Handler<QualityReported>): EventSource;
        on(event: "ErrorOccurred", handler: Handler<ErrorOccurred>): EventSource;
        on(event: "AcquisitionStarted", handler: Handler<AcquisitionStarted>): EventSource;
        on(event: "AcquisitionStopped", handler: Handler<AcquisitionStopped>): EventSource;
        on(event: "CommunicationFailed", handler: Handler<CommunicationFailed>): EventSource;
        off(event?: string, handler?: Handler<Event>): EventSource;
    }
    class WebApi implements EventSource {
        private webChannel;
        private requests;
        private handlers;
        constructor(options?: WebSdk.WebChannelOptionsData);
        enumerateDevices(): Promise<string[]>;
        getDeviceInfo(deviceUid: string): Promise<DeviceInfo>;
        startAcquisition(sampleFormat: SampleFormat, deviceUid?: string): Promise<void>;
        stopAcquisition(deviceUid?: string): Promise<void>;
        private onConnectionSucceed;
        private onConnectionFailed;
        private onDataReceivedTxt;
        private processQueue;
        private processResponse;
        private processNotification;
        onDeviceConnected?: Handler<DeviceConnected>;
        onDeviceDisconnected?: Handler<DeviceDisconnected>;
        onSamplesAcquired?: Handler<SamplesAcquired>;
        onQualityReported?: Handler<QualityReported>;
        onErrorOccurred?: Handler<ErrorOccurred>;
        onAcquisitionStarted?: Handler<AcquisitionStarted>;
        onAcquisitionStopped?: Handler<AcquisitionStopped>;
        onCommunicationFailed?: Handler<CommunicationFailed>;
        on<E extends Event>(event: string, handler: Handler<E>): WebApi;
        off(event?: string, handler?: Handler<Event>): WebApi;
        protected emit(event: Event): void;
        private invoke;
    }
}
