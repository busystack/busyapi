// Ordinary two-field native input reproduction. Never packaged.
import 'package:flutter/material.dart';

void main() => runApp(const MaterialApp(home: InputProbe()));

class InputProbe extends StatelessWidget {
  const InputProbe({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Padding(
      padding: const EdgeInsets.all(80),
      child: Column(
        children: [
          TextFormField(
            initialValue: 'Production 3.2.1',
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Title'),
            onChanged: (value) => debugPrint('INPUT $value'),
          ),
          TextFormField(
            initialValue: 'api-version',
            decoration: const InputDecoration(labelText: 'API version'),
          ),
        ],
      ),
    ),
  );
}
