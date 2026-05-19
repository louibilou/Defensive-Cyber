import cv2
import argparse
from imwatermark import WatermarkEncoder, WatermarkDecoder


DEFAULT_WATERMARK = "loui's watermark"
DEFAULT_METHOD = "dwtDct"


def embed_watermark(input_path, output_path, watermark_text, method=DEFAULT_METHOD):
    image = cv2.imread(input_path)

    if image is None:
        raise FileNotFoundError(f"Could not read image: {input_path}")

    encoder = WatermarkEncoder()
    encoder.set_watermark("bytes", watermark_text.encode("utf-8"))

    watermarked_image = encoder.encode(image, method)
    cv2.imwrite(output_path, watermarked_image)

    bit_length = len(watermark_text.encode("utf-8")) * 8

    print("Watermark embedded successfully.")
    print(f"Output image: {output_path}")
    print(f"Watermark text: {watermark_text}")
    print(f"Bit length needed for decoding: {bit_length}")


def extract_watermark(input_path, bit_length, method=DEFAULT_METHOD):
    image = cv2.imread(input_path)

    if image is None:
        raise FileNotFoundError(f"Could not read image: {input_path}")

    decoder = WatermarkDecoder("bytes", bit_length)
    watermark = decoder.decode(image, method)

    try:
        decoded_text = watermark.decode("utf-8")
    except UnicodeDecodeError:
        decoded_text = str(watermark)

    print(f"Extracted watermark: {decoded_text}")


def main():
    parser = argparse.ArgumentParser(description="Embed or extract an invisible watermark using WatermarkEncoder.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    embed_parser = subparsers.add_parser("embed")
    embed_parser.add_argument("input", help="Input image path")
    embed_parser.add_argument("output", help="Output image path")
    embed_parser.add_argument("--text", default=DEFAULT_WATERMARK, help="Watermark text")
    embed_parser.add_argument("--method", default=DEFAULT_METHOD, choices=["dwtDct", "dwtDctSvd", "rivaGan"])

    extract_parser = subparsers.add_parser("extract")
    extract_parser.add_argument("input", help="Watermarked image path")
    extract_parser.add_argument("--bits", type=int, required=True, help="Bit length of watermark")
    extract_parser.add_argument("--method", default=DEFAULT_METHOD, choices=["dwtDct", "dwtDctSvd", "rivaGan"])

    args = parser.parse_args()

    if args.command == "embed":
        embed_watermark(args.input, args.output, args.text, args.method)

    elif args.command == "extract":
        extract_watermark(args.input, args.bits, args.method)


if __name__ == "__main__":
    main()
