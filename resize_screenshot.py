from PIL import Image

def process_screenshot(input_path, output_path):
    target_width = 1284
    target_height = 2778
    img = Image.open(input_path)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        bg.paste(img, mask=img.split()[3])
        img = bg
    else:
        img = img.convert('RGB')
    img.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    final_img = Image.new('RGB', (target_width, target_height), (255, 255, 255))
    x = (target_width - img.width) // 2
    y = (target_height - img.height) // 2
    final_img.paste(img, (x, y))
    final_img.save(output_path, 'PNG', quality=95)
    print(f"Готово! Скриншот сохранен как: {output_path}")

process_screenshot('input.png', 'фото приложения 3.png')