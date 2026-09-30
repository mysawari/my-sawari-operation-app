import os
import re

directory = 'app'

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js') or file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()

            if '<DateTimePicker' in content:
                # We need to find onChange={handler}
                # and replace it with:
                # onValueChange={handler} onDismiss={() => handler({type: "dismissed"})}
                
                # regex to find onChange={something}
                def replace_match(match):
                    handler = match.group(1)
                    return f'onValueChange={{{handler}}} onDismiss={{() => {handler}({{type: "dismissed"}})}}'
                
                new_content = re.sub(r'onChange={([^}]+)}', replace_match, content)
                
                if new_content != content:
                    with open(path, 'w') as f:
                        f.write(new_content)
                    print(f"Fixed {path}")
