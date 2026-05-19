#!/usr/bin/env python3
"""
watermark_decoder.py

Extract a hidden text watermark from an image created with watermark_encoder.py.

Example:
    python watermark_decoder.py watermarked_dashund.png
"""

from PIL import Image
import argparse


END_MARKER = "<<<END_OF_WATERMARK>>>"


def bits_to_text(bits: str) -> str:
    chars = []

    for i in range(0, len(bits), 8):
        byte = bits[i:i + 8]

        if len(byte) < 8:
            break

        chars.append(chr(int(byte, 2)))
        current_text = "".join(chars)

        if END_MARKER in current_text:
            return current_text.replace(END_MARKER, "")

    raise ValueError("No valid watermark found.")


def extract_watermark(image_path: str) -> str:
    img = Image.open(image_path).convert("RGB")
    pixels = img.load()

    width, height = img.size
    bits = []

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]

            bits.append(str(r & 1))
            bits.append(str(g & 1))
            bits.append(str(b & 1))

            # Try decoding every so often instead of waiting until the full image is read.
            if len(bits) % 800 == 0:
                try:
                    return bits_to_text("".join(bits))
                except ValueError:
                    pass

    return bits_to_text("".join(bits))


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract an invisible text watermark from an image.")
    parser.add_argument("image", help="Path to the watermarked image, e.g. watermarked_dashund.png")

    args = parser.parse_args()

    try:
        watermark = extract_watermark(args.image)
        print("Extracted watermark:")
        print(watermark)
    except ValueError as error:
        print(error)


if __name__ == "__main__":
    main()
